// Keepa REST クライアント。API キー無しの場合は使われず、createMockMetrics にフォールバックする。
// 本実装は最小限: 価格 / BSR / 出品者の時系列を取得し、TimeSeriesPoint[] に変換する。
import { env } from "@/lib/env";
import { usage } from "@/lib/usage/tracker";
import type { TimeSeriesPoint } from "@/lib/types";

const BASE_URL = "https://api.keepa.com";

/**
 * Keepa /product?images=1 で返る画像 object。
 * 新仕様: `images: [{ l, lH, lW, m, mH, mW }, ...]` 配列で返る。
 * 旧仕様 `imagesCSV` (CSV 文字列) は API バージョンによっては残っているので
 * 互換性のため両方ハンドリングする。
 */
interface KeepaImageObj {
  /** large (高解像度) filename。 1500-2000px 程度 */
  l?: string;
  lH?: number;
  lW?: number;
  /** medium filename。 500-800px。 l がない場合はこちらを使う */
  m?: string;
  mH?: number;
  mW?: number;
}

interface KeepaProductResponse {
  tokensLeft?: number;
  tokensConsumed?: number;
  products?: Array<{
    asin: string;
    title?: string;
    brand?: string;
    productGroup?: string;
    categoryTree?: Array<{ name?: string }>;
    /** Keepa のルートカテゴリ ID。 CATEGORIES.keepaRootCategory と一致 */
    rootCategory?: number;
    csv?: Array<number[] | null>;
    /** 新仕様 (現行 Keepa API) */
    images?: KeepaImageObj[];
    /** 旧仕様 (一部 endpoint で残っている可能性) */
    imagesCSV?: string;
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
    isHazmat?: boolean;
  }>;
}

function filenameToAmazonUrl(file: string): string {
  // Keepa は basename のみ返す場合と、拡張子付きで返す場合がある。
  // どちらも m.media-amazon.com/images/I/ の下に存在するので、無ければ .jpg を補う。
  const name = /\.(jpg|jpeg|png|gif|webp)$/i.test(file) ? file : `${file}.jpg`;
  return `https://m.media-amazon.com/images/I/${name}`;
}

/**
 * Keepa の `images` 配列をフル URL に変換する。 large 優先、 無ければ medium。
 */
export function keepaImagesArrayToUrls(
  images: KeepaImageObj[] | undefined | null,
): string[] {
  if (!Array.isArray(images)) return [];
  const urls: string[] = [];
  for (const img of images) {
    const file = img?.l ?? img?.m;
    if (typeof file !== "string" || file.length === 0) continue;
    urls.push(filenameToAmazonUrl(file));
  }
  return urls;
}

/**
 * Keepa imagesCSV (旧仕様) をフル URL に変換する。 後方互換のため残置。
 */
export function keepaImagesToUrls(imagesCSV: string | undefined | null): string[] {
  if (!imagesCSV) return [];
  return imagesCSV
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(filenameToAmazonUrl);
}

/**
 * 統合 helper: 新仕様 `images` 配列を優先、 無ければ旧仕様 `imagesCSV` を見る。
 * ingestDiscover / ingestDiff / ingestFull の 3 経路すべてで使う。
 */
export function extractKeepaImageUrls(
  raw:
    | { images?: KeepaImageObj[]; imagesCSV?: string }
    | null
    | undefined,
): string[] {
  if (!raw) return [];
  const fromArray = keepaImagesArrayToUrls(raw.images);
  if (fromArray.length > 0) return fromArray;
  return keepaImagesToUrls(raw.imagesCSV);
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
  /** Keepa のルートカテゴリ ID (数値)。 14 root の判定に使う */
  rootCategoryId?: number;
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

async function fetchWithRetry(
  url: string,
  attempts = 3,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown = null;
  let lastStatus = 0;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store", ...init });
      if (res.ok) return res;
      lastStatus = res.status;
      // 429 (rate limit) は長めに待つ。 Keepa は token 補充が遅いので 5 秒以上必要。
      if (res.status === 429) {
        lastError = new Error(`Keepa returned 429 (rate limit / token refill in progress)`);
        await new Promise((r) => setTimeout(r, (i + 1) * 3000));
        continue;
      }
      // 500/503 は短く待ってリトライ
      if (res.status >= 500) {
        lastError = new Error(`Keepa returned ${res.status}`);
        await new Promise((r) => setTimeout(r, (i + 1) * 600));
        continue;
      }
      // 4xx (rate limit 以外) は再試行しない
      return res;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, (i + 1) * 600));
    }
  }
  // どのケースでもログに残せるよう lastStatus を埋める
  throw lastError ?? new Error(`Keepa request failed after ${attempts} attempts (last status ${lastStatus})`);
}

/** Keepa Search で得られる軽量な商品サマリ。 */
export interface KeepaSearchHit {
  asin: string;
  title?: string;
  brand?: string;
  imageUrl?: string;
}

/**
 * Keepa Product Finder (POST /query) の返却 product。
 * stats.current から現在値を、 packageWeight / monthlySold で物理スペックを引ける。
 * 履歴 csv は含まないので、詳細ページでは fetchKeepaSeries を使う。
 */
export interface KeepaProduct {
  asin: string;
  title?: string;
  brand?: string;
  imageUrl?: string;
  category?: string;
  /** Keepa のルートカテゴリ ID (数値)。 CATEGORIES.keepaRootCategory と一致する。 */
  rootCategoryId?: number;
  weightGrams?: number;
  /** Keepa 推定の直近 30 日販売数。 -1 なら不明。 */
  monthlySold?: number;
  /** 現在値スナップショット (csv と同じ index 順) */
  currentPrice?: number;
  currentSellerCount?: number;
  currentReviewCount?: number;
  currentRating?: number;
  currentBsr?: number;
  isHazmat?: boolean;
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
    images?: KeepaImageObj[];
    imagesCSV?: string;
  }>;
}

/** Keepa /query (Product Finder) のレスポンス。 */
interface KeepaQueryResponse {
  tokensConsumed?: number;
  tokensLeft?: number;
  totalResults?: number;
  products?: Array<{
    asin: string;
    title?: string;
    brand?: string;
    productGroup?: string;
    categoryTree?: Array<{ name?: string }>;
    /** Keepa のルートカテゴリ ID (数値)。 CATEGORIES.keepaRootCategory と一致 */
    rootCategory?: number;
    images?: KeepaImageObj[];
    imagesCSV?: string;
    packageWeight?: number;
    itemWeight?: number;
    monthlySold?: number;
    isHazmat?: boolean;
    stats?: { current?: number[] };
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

  const products = Array.isArray(data.products) ? data.products : null;
  const asinList = Array.isArray(data.asinList) ? data.asinList : null;
  console.info("[apde:keepa:search]", {
    term,
    productsCount: products?.length ?? 0,
    asinListCount: asinList?.length ?? 0,
    tokensLeft: (data as Record<string, unknown>).tokensLeft,
    tokensConsumed: (data as Record<string, unknown>).tokensConsumed,
  });

  if (products && products.length > 0) {
    const hits = products
      .filter((p) => typeof p.asin === "string" && p.asin.length > 0)
      .slice(0, limit)
      .map((p) => ({
        asin: p.asin,
        title: p.title,
        brand: p.brand,
        imageUrl: extractKeepaImageUrls(p)[0],
      }));
    if (hits.length > 0) return hits;
    console.warn("[apde:keepa:search] products[] had no usable asin field", { term });
  }

  if (asinList && asinList.length > 0) {
    return asinList
      .filter((a) => typeof a === "string" && a.length > 0)
      .slice(0, limit)
      .map((asin) => ({ asin }));
  }

  return [];
}

export interface FindProductsInput {
  /** Keepa Amazon rootCategory ID。 必須 */
  rootCategory: number;
  /** タイトル部分一致 (空文字なら全件) */
  title?: string;
  minPriceJpy?: number;
  maxPriceJpy?: number;
  minReviews?: number;
  maxReviews?: number;
  /** 取得件数上限 (1〜200)。 1 ページ最大 100、超える場合は 2 ページ目を取得する。 */
  limit?: number;
}

const ARRAY_INDEX_QUERY = ARRAY_INDEX; // alias

/**
 * Keepa Product Finder で商品を一括取得。
 * 1 コール 5〜10 トークンで最大 100 件 (perPage=100)。 200 件まで欲しい場合は page=1 を追加で呼ぶ。
 */
// Keepa /query の perPage は API 側で最小値が課されている (実測 50 以下は 400 で拒否)。
// そのため targetLimit が小さくても perPage は MIN 以上を投げ、結果を後段で slice する。
const KEEPA_QUERY_MIN_PER_PAGE = 50;
const KEEPA_QUERY_MAX_PER_PAGE = 100;

export async function findProductsByCategory(input: FindProductsInput): Promise<KeepaProduct[]> {
  if (!env.keepa.configured) throw new Error("Keepa API key not configured");
  const targetLimit = Math.min(Math.max(input.limit ?? 100, 1), 200);

  const collected: KeepaProduct[] = [];
  for (let page = 0; page < 2 && collected.length < targetLimit; page += 1) {
    const remaining = targetLimit - collected.length;
    const perPage = Math.max(
      KEEPA_QUERY_MIN_PER_PAGE,
      Math.min(remaining, KEEPA_QUERY_MAX_PER_PAGE),
    );
    const selection: Record<string, unknown> = {
      rootCategory: input.rootCategory,
      productType: [0],
      perPage,
      page,
      sort: [["current_REVIEWS", "desc"]],
    };
    // Keepa は JPY を raw yen で保持する (USD/EUR は cents だが、 JPY に subunit が
    // ないため整数値そのまま)。 過去に *100 していたが ¥300,000+ の商品が返って
    // しまうバグだったので、 yen 値をそのまま渡す。
    // current_AMAZON は Amazon 自身が出品者のときのみ有効で、 JP の多くの商品は
    // 3rd-party のみ (current_NEW のみ有効) のため、 current_NEW だけで絞り込む。
    if (typeof input.minPriceJpy === "number") {
      selection.current_NEW_gte = input.minPriceJpy;
    }
    if (typeof input.maxPriceJpy === "number") {
      selection.current_NEW_lte = input.maxPriceJpy;
    }
    if (typeof input.minReviews === "number") selection.current_COUNT_REVIEWS_gte = input.minReviews;
    if (typeof input.maxReviews === "number") selection.current_COUNT_REVIEWS_lte = input.maxReviews;
    if (input.title && input.title.trim().length > 0) selection.title = input.title.trim();

    // Keepa /query は GET + selection (URL-encoded JSON) が公式形式。 POST も受けるが
    // domain= はクエリ側、selection= はクエリ側に置く必要がある。
    // images=1 やオプション系は加算課金されるので最小構成にとどめる (画像は無くても
    // placeholder で表示できるので 1 ingest あたりのコストを優先)。
    const selectionParam = encodeURIComponent(JSON.stringify(selection));
    const url = `${BASE_URL}/query?key=${encodeURIComponent(env.keepa.apiKey)}&domain=${env.keepa.domain}&selection=${selectionParam}`;
    const start = Date.now();
    const res = await fetchWithRetry(url, 3);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Keepa /query returned ${res.status}: ${body.slice(0, 200)}`);
    }
    const data: KeepaQueryResponse & {
      asinList?: string[];
      error?: { message?: string };
    } = await res.json();
    void usage.keepa("/query", data.tokensConsumed ?? 5);
    const products = Array.isArray(data.products) ? data.products : [];
    const asinList = Array.isArray(data.asinList) ? data.asinList : [];
    console.info("[apde:keepa:query]", {
      rootCategory: input.rootCategory,
      title: input.title ?? null,
      page,
      productsCount: products.length,
      asinListCount: asinList.length,
      tokensConsumed: data.tokensConsumed,
      tokensLeft: data.tokensLeft,
      totalResults: data.totalResults,
      error: data.error?.message,
      durationMs: Date.now() - start,
    });

    // products が空でも asinList が返ってくる場合がある (selection.outputAsin が無視された場合)
    // その場合は asin だけの軽量 KeepaProduct を生成 (詳細は detail で fetch)
    if (products.length === 0 && asinList.length > 0) {
      for (const asin of asinList) {
        if (typeof asin !== "string" || asin.length === 0) continue;
        collected.push({ asin });
      }
      if (collected.length >= targetLimit) break;
      continue;
    }

    for (const p of products) {
      if (typeof p.asin !== "string" || p.asin.length === 0) continue;
      const currentArr = p.stats?.current ?? [];
      const pickCurrent = (idx: number): number | undefined => {
        const v = currentArr[idx];
        return typeof v === "number" && v > 0 ? v : undefined;
      };
      const weightDecigrams = p.packageWeight ?? p.itemWeight;
      const weightGrams =
        typeof weightDecigrams === "number" && weightDecigrams > 0
          ? Math.round(weightDecigrams / 10)
          : undefined;
      const categoryName = p.categoryTree?.[p.categoryTree.length - 1]?.name;
      const ratingRaw = pickCurrent(ARRAY_INDEX_QUERY.RATING);
      collected.push({
        asin: p.asin,
        title: p.title,
        brand: p.brand,
        imageUrl: extractKeepaImageUrls(p)[0],
        category: categoryName ?? p.productGroup,
        rootCategoryId: typeof p.rootCategory === "number" ? p.rootCategory : undefined,
        weightGrams,
        monthlySold:
          typeof p.monthlySold === "number" && p.monthlySold >= 0 ? p.monthlySold : undefined,
        currentPrice:
          pickCurrent(ARRAY_INDEX_QUERY.AMAZON) ?? pickCurrent(ARRAY_INDEX_QUERY.NEW),
        currentSellerCount: pickCurrent(ARRAY_INDEX_QUERY.COUNT_NEW),
        currentReviewCount: pickCurrent(ARRAY_INDEX_QUERY.COUNT_REVIEWS),
        currentRating: ratingRaw !== undefined ? ratingRaw / 10 : undefined,
        currentBsr: pickCurrent(ARRAY_INDEX_QUERY.SALES_RANK),
        isHazmat: p.isHazmat,
      });
    }

    // ページネーション継続条件: 取得結果が perPage いっぱいで、 limit 未達のときのみ次ページへ
    if (products.length < perPage) break;
  }

  return collected.slice(0, targetLimit);
}

/**
 * 複数 ASIN を 1 リクエストでまとめて取得する軽量バッチ。 history=0 で履歴を持たず、
 * stats.current のみ返るので Discovery 段階で十分。 1 ASIN ≈ 1 トークン (history なし)。
 */
export async function fetchKeepaProductsBatch(asins: string[]): Promise<KeepaProduct[]> {
  if (!env.keepa.configured) throw new Error("Keepa API key not configured");
  if (asins.length === 0) return [];
  // Keepa /product は最大 100 ASIN まで csv-list で受ける
  const chunks: string[][] = [];
  for (let i = 0; i < asins.length; i += 100) chunks.push(asins.slice(i, i + 100));
  const out: KeepaProduct[] = [];

  for (const chunk of chunks) {
    const url =
      `${BASE_URL}/product?key=${encodeURIComponent(env.keepa.apiKey)}` +
      `&domain=${env.keepa.domain}` +
      `&asin=${encodeURIComponent(chunk.join(","))}` +
      `&history=0&stats=1&images=1`;
    const start = Date.now();
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[apde:keepa:bulk-product] failed", { status: res.status, body: body.slice(0, 200) });
      continue;
    }
    const data: KeepaProductResponse = await res.json();
    void usage.keepa("/product (bulk)", data.tokensConsumed ?? chunk.length);
    const products = data.products ?? [];
    console.info("[apde:keepa:bulk-product]", {
      requested: chunk.length,
      returned: products.length,
      tokensConsumed: data.tokensConsumed,
      durationMs: Date.now() - start,
    });
    for (const p of products) {
      if (typeof p.asin !== "string" || p.asin.length === 0) continue;
      const currentArr = p.stats?.current ?? [];
      const pickCurrent = (idx: number): number | undefined => {
        const v = currentArr[idx];
        return typeof v === "number" && v > 0 ? v : undefined;
      };
      const weightDecigrams = p.packageWeight ?? p.itemWeight;
      const weightGrams =
        typeof weightDecigrams === "number" && weightDecigrams > 0
          ? Math.round(weightDecigrams / 10)
          : undefined;
      const categoryName = p.categoryTree?.[p.categoryTree.length - 1]?.name;
      const ratingRaw = pickCurrent(ARRAY_INDEX.RATING);
      out.push({
        asin: p.asin,
        title: p.title,
        brand: p.brand,
        imageUrl: extractKeepaImageUrls(p)[0],
        category: categoryName ?? p.productGroup,
        rootCategoryId: typeof p.rootCategory === "number" ? p.rootCategory : undefined,
        weightGrams,
        monthlySold:
          typeof p.monthlySold === "number" && p.monthlySold >= 0 ? p.monthlySold : undefined,
        currentPrice:
          pickCurrent(ARRAY_INDEX.AMAZON) ?? pickCurrent(ARRAY_INDEX.NEW),
        currentSellerCount: pickCurrent(ARRAY_INDEX.COUNT_NEW),
        currentReviewCount: pickCurrent(ARRAY_INDEX.COUNT_REVIEWS),
        currentRating: ratingRaw !== undefined ? ratingRaw / 10 : undefined,
        currentBsr: pickCurrent(ARRAY_INDEX.SALES_RANK),
        isHazmat: p.isHazmat,
      });
    }
  }
  return out;
}

/**
 * Keepa /category?category=0&domain=5 で Amazon JP のルートカテゴリ一覧を取得する。
 * 1 コール 1 token 程度。 categories.ts の rootCategory ID 検証に使う。
 * 戻り値は { catId, name, productCount? } の配列。
 */
export interface KeepaRootCategory {
  catId: number;
  name: string;
  productCount?: number;
  children?: number[];
}

interface KeepaCategoryResponse {
  tokensConsumed?: number;
  categories?: Record<
    string,
    {
      catId?: number;
      name?: string;
      productCount?: number;
      children?: number[];
      parent?: number;
    }
  >;
}

export async function fetchKeepaRootCategories(): Promise<KeepaRootCategory[]> {
  if (!env.keepa.configured) throw new Error("Keepa API key not configured");
  // category=0 でルートのみを取得 (子は children IDs として返る)
  const url = `${BASE_URL}/category?key=${encodeURIComponent(env.keepa.apiKey)}&domain=${env.keepa.domain}&category=0`;
  const res = await fetchWithRetry(url, 2);
  if (!res.ok) throw new Error(`Keepa /category returned ${res.status}`);
  const data = (await res.json()) as KeepaCategoryResponse;
  void usage.keepa("/category", data.tokensConsumed ?? 1);
  const map = data.categories ?? {};
  const out: KeepaRootCategory[] = [];
  for (const [, cat] of Object.entries(map)) {
    if (typeof cat.catId !== "number") continue;
    if (typeof cat.name !== "string" || cat.name.length === 0) continue;
    out.push({
      catId: cat.catId,
      name: cat.name,
      productCount: cat.productCount,
      children: cat.children,
    });
  }
  return out;
}

/** Keepa /token のレスポンス。 R4 Cron の budget 算出に使う。 */
export interface KeepaTokenStatus {
  /** 現在の残トークン (free-tier は最大 60) */
  tokensLeft: number;
  /** 1 分あたりの補充トークン数 */
  refillRate: number;
  /** 次のトークン補充まで何 ms 後か */
  refillIn: number;
}

/**
 * Keepa /token エンドポイント。 0 token 消費 (使用量にカウントされない)。
 * Cron が呼び出し前の budget を決めるのに使う。
 */
export async function fetchKeepaTokenStatus(): Promise<KeepaTokenStatus> {
  if (!env.keepa.configured) throw new Error("Keepa API key not configured");
  const url = `${BASE_URL}/token?key=${encodeURIComponent(env.keepa.apiKey)}`;
  const res = await fetchWithRetry(url, 2);
  if (!res.ok) throw new Error(`Keepa /token returned ${res.status}`);
  const data = (await res.json()) as Partial<KeepaTokenStatus>;
  return {
    tokensLeft: typeof data.tokensLeft === "number" ? data.tokensLeft : 0,
    refillRate: typeof data.refillRate === "number" ? data.refillRate : 1,
    refillIn: typeof data.refillIn === "number" ? data.refillIn : 60_000,
  };
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
  const imageUrls = extractKeepaImageUrls(product);
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
    rootCategoryId: typeof product.rootCategory === "number" ? product.rootCategory : undefined,
    weightGrams,
    monthlySold: typeof product.monthlySold === "number" && product.monthlySold >= 0 ? product.monthlySold : undefined,
    currentReviewCount:
      product.reviewsCount ?? pickCurrent(ARRAY_INDEX.COUNT_REVIEWS),
    currentRating: currentRating !== undefined ? currentRating / 10 : product.rating !== undefined ? product.rating / 10 : undefined,
    currentSellerCount: pickCurrent(ARRAY_INDEX.COUNT_NEW),
    currentPrice: pickCurrent(ARRAY_INDEX.AMAZON) ?? pickCurrent(ARRAY_INDEX.NEW),
  };
}
