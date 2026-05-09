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
    csv?: Array<number[] | null>;
    imagesCSV?: string; // 例: "61abc.jpg,62def.jpg,..."
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
    .map((file) => `https://m.media-amazon.com/images/I/${file}`);
}

const ARRAY_INDEX = {
  AMAZON: 0,
  NEW: 1,
  USED: 2,
  SALES_RANK: 3,
  COUNT_NEW: 11, // approximate seller count
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
  /** メイン商品画像 URL (imagesCSV の先頭) */
  imageUrl?: string;
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

export async function fetchKeepaSeries(asin: string): Promise<KeepaSeries> {
  if (!env.keepa.configured) {
    throw new Error("Keepa API key not configured");
  }
  // images=1 で imagesCSV を取得（追加トークンコストは Keepa の "1 product" 内で済む）
  const url = `${BASE_URL}/product?key=${encodeURIComponent(env.keepa.apiKey)}&domain=${env.keepa.domain}&asin=${encodeURIComponent(asin)}&history=1&images=1`;
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
  return {
    price: csvToSeries(csv[ARRAY_INDEX.AMAZON] ?? csv[ARRAY_INDEX.NEW]),
    bsr: csvToSeries(csv[ARRAY_INDEX.SALES_RANK]),
    sellers: csvToSeries(csv[ARRAY_INDEX.COUNT_NEW]),
    buyBox: csvToSeries(csv[ARRAY_INDEX.BUY_BOX]),
    imageUrl: imageUrls[0],
  };
}
