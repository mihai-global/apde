// Keepa REST クライアント。API キー無しの場合は使われず、createMockMetrics にフォールバックする。
// 本実装は最小限: 価格 / BSR / 出品者の時系列を取得し、TimeSeriesPoint[] に変換する。
import { env } from "@/lib/env";
import { usage } from "@/lib/usage/tracker";
import type { TimeSeriesPoint } from "@/lib/types";

const BASE_URL = "https://api.keepa.com";

interface KeepaProductResponse {
  tokensLeft?: number;
  tokensConsumed?: number;
  products?: Array<{
    asin: string;
    title?: string;
    brand?: string;
    productGroup?: string;
    categoryTree?: Array<{ name?: string }>;
    csv?: Array<number[] | null>;
    imagesCSV?: string; // 例: "61abc.jpg,62def.jpg,..."
    /** Keepa の現在値スナップショット (履歴とは別) */
    stats?: {
      current?: number[]; // index 順は csv と同じ。-1 は欠損
    };
    /** 商品の重量。 Keepa は 10 倍値 (g x 10) を返す → /10 で g */
    packageWeight?: number;
    itemWeight?: number;
    /** 直近 30 日の販売数 (Keepa が推定可能な場合) */
    monthlySold?: number;
    /** 現在のレビュー件数・★★ (Keepa は 10 倍値 = 45 → 4.5) */
    reviewsCount?: number;
    rating?: number;
  }>;
}

/**
 * Keepa imagesCSV をフル URL に変換する。
 * Keepa は filename だけを返すため、Amazon CDN にプレフィックスを付ける必要がある。
 * 戻り値: 各画像の絶対 URL 配列（先頭がメイン画像）
 */
export function keepaImagesToUrls(imagesCSV: string | undefined | null): string[] {
  if (!imagesCSV) return [];
  return imagesCSV
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((file) => {
      // Keepa は basename のみ返す場合と、拡張子付きで返す場合がある。
      // どちらも m.media-amazon.com/images/I/ の下に存在するので、無ければ .jpg を補う。
      const name = /\.(jpg|jpeg|png|gif|webp)$/i.test(file) ? file : `${file}.jpg`;
      return `https://m.media-amazon.com/images/I/${name}`;
    });
}

const ARRAY_INDEX = {
  AMAZON: 0,
  NEW: 1,
  USED: 2,
  SALES_RANK: 3,
  COUNT_NEW: 11, // approximate seller count
  RATING: 16, // ×10 (e.g. 45 = 4.5)
  COUNT_REVIEWS: 17,
  BUY_BOX: 18,
} as const;

// Keepa の minute-based timestamp (since epoch + 21564000) を ISO 文字列に変換
function keepaMinutesToIso(minutes: number): string {
  return new Date((21564000 + minutes) * 60 * 1000).toISOString();
}

function csvToSeries(csv: number[] | null | undefined): TimeSeriesPoint[] {
  if (!csv) return [];
  const points: TimeSeriesPoint[] = [];
  for (let i = 0; i < csv.length; i += 2) {
    const ts = csv[i];
    const value = csv[i + 1];
    if (typeof ts !== "number" || typeof value !== "number" || value < 0) continue;
    points.push({ timestamp: keepaMinutesToIso(ts), value });
  }
  return points;
}

export interface KeepaSeries {
  price: TimeSeriesPoint[];
  bsr: TimeSeriesPoint[];
  sellers: TimeSeriesPoint[];
  buyBox: TimeSeriesPoint[];
  reviewCount: TimeSeriesPoint[];
  rating: TimeSeriesPoint[]; // value は ×10 (45 → 4.5)
  /** メイン商品画像 URL (imagesCSV の先頭) */
  imageUrl?: string;
  title?: string;
  brand?: string;
  category?: string;
  /** 商品スペック (履歴ではない現在値スナップショット) */
  weightGrams?: number;
  /** 直近 30 日の推定販売数 */
  monthlySold?: number;
  /** 現在のレビュー件数 */
  currentReviewCount?: number;
  /** 現在の★ (1-5) */
  currentRating?: number;
  /** 現在の出品者数 */
  currentSellerCount?: number;
  /** 現在価格 (Keepa stats.current[0/1] 由来) */
  currentPrice?: number;
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return res;
      // 429/500 は指数バックオフで再試行
      if (res.status >= 500 || res.status === 429) {
        await new Promise((r) => setTimeout(r, (i + 1) * 600));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, (i + 1) * 600));
    }
  }
  throw lastError ?? new Error("Keepa request failed");
}

/** Keepa Search で得られる軽量な商品サマリ。 */
export interface KeepaSearchHit {
  asin: string;
  title?: string;
  brand?: string;
  imageUrl?: string;
}

interface KeepaSearchResponse {
  tokensConsumed?: number;
  totalResults?: number;
  /** type=product では基本これだけ返る (ASIN 文字列の配列) */
  asinList?: string[];
  /** category browse 等では rich product objects が返る */
  products?: Array<{
    asin: string;
    title?: string;
    brand?: string;
    imagesCSV?: string;
  }>;
}

/**
 * Keepa Search API でキーワード検索 → ASIN リストを返す。
 * `term` を URL エンコードして渡す。 type=product, domain=5 (Amazon.co.jp)。
 * 1 回 5 トークン、1 ページあたり最大 40 件。
 *
 * 注: type=product のレスポンスは `asinList` (string[]) で返るパターンが主流。
 * `products` (rich object) で返るプランもあるため両方ハンドリングする。
 */
export async function searchKeepa(term: string, limit = 10): Promise<KeepaSearchHit[]> {
  if (!env.keepa.configured) {
    throw new Error("Keepa API key not configured");
  }
  const url = `${BASE_URL}/search?key=${encodeURIComponent(env.keepa.apiKey)}&domain=${env.keepa.domain}&type=product&term=${encodeURIComponent(term)}&page=0`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Keepa search returned ${res.status}`);
  }
  const data: KeepaSearchResponse = await res.json();
  void usage.keepa("/search", data.tokensConsumed ?? 5);

  if (data.products && data.products.length > 0) {
    return data.products.slice(0, limit).map((p) => ({
      asin: p.asin,
      title: p.title,
      brand: p.brand,
      imageUrl: keepaImagesToUrls(p.imagesCSV)[0],
    }));
  }

  if (data.asinList && data.asinList.length > 0) {
    return data.asinList.slice(0, limit).map((asin) => ({ asin }));
  }

  return [];
}

export async function fetchKeepaSeries(asin: string): Promise<KeepaSeries> {
  if (!env.keepa.configured) {
    throw new Error("Keepa API key not configured");
  }
  // images=1 で imagesCSV、stats=1 で stats.current のスナップショットを取得 (追加トークン無し)
  const url = `${BASE_URL}/product?key=${encodeURIComponent(env.keepa.apiKey)}&domain=${env.keepa.domain}&asin=${encodeURIComponent(asin)}&history=1&images=1&stats=1`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Keepa returned ${res.status}`);
  }
  const data: KeepaProductResponse = await res.json();
  void usage.keepa("/product", data.tokensConsumed ?? 1);
  const product = data.products?.[0];
  if (!product) throw new Error("Keepa returned empty product");

  const csv = product.csv ?? [];
  const imageUrls = keepaImagesToUrls(product.imagesCSV);
  const categoryName = product.categoryTree?.[product.categoryTree.length - 1]?.name;
  const weightDecigrams = product.packageWeight ?? product.itemWeight;
  const weightGrams = typeof weightDecigrams === "number" && weightDecigrams > 0
    ? Math.round(weightDecigrams / 10)
    : undefined;
  // stats.current は csv と同じ index 順。 -1 は欠損なので除外。
  const currentArr = product.stats?.current ?? [];
  const pickCurrent = (idx: number): number | undefined => {
    const v = currentArr[idx];
    return typeof v === "number" && v > 0 ? v : undefined;
  };
  const currentRating = pickCurrent(ARRAY_INDEX.RATING);
  return {
    price: csvToSeries(csv[ARRAY_INDEX.AMAZON] ?? csv[ARRAY_INDEX.NEW]),
    bsr: csvToSeries(csv[ARRAY_INDEX.SALES_RANK]),
    sellers: csvToSeries(csv[ARRAY_INDEX.COUNT_NEW]),
    buyBox: csvToSeries(csv[ARRAY_INDEX.BUY_BOX]),
    reviewCount: csvToSeries(csv[ARRAY_INDEX.COUNT_REVIEWS]),
    rating: csvToSeries(csv[ARRAY_INDEX.RATING]),
    imageUrl: imageUrls[0],
    title: product.title,
    brand: product.brand,
    category: categoryName ?? product.productGroup,
    weightGrams,
    monthlySold: typeof product.monthlySold === "number" && product.monthlySold >= 0 ? product.monthlySold : undefined,
    currentReviewCount:
      product.reviewsCount ?? pickCurrent(ARRAY_INDEX.COUNT_REVIEWS),
    currentRating: currentRating !== undefined ? currentRating / 10 : product.rating !== undefined ? product.rating / 10 : undefined,
    currentSellerCount: pickCurrent(ARRAY_INDEX.COUNT_NEW),
    currentPrice: pickCurrent(ARRAY_INDEX.AMAZON) ?? pickCurrent(ARRAY_INDEX.NEW),
  };
}
