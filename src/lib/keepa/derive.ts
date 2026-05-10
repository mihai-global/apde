// Keepa 時系列から派生指標 (CV, セール頻度, 価格下落率, Buy Box 集中度) を計算する。
import { createMockMetrics } from "@/lib/keepa/mock";
import { applyBrandPolicy } from "@/lib/scoring/brand-policy";
import type { KeepaProduct } from "@/lib/keepa/client";
import type { AsinMetrics, KeepaDerivedMetrics } from "@/lib/types";

export function deriveKeepaMetrics(metrics: AsinMetrics): KeepaDerivedMetrics {
  const prices = metrics.priceHistory.map((p) => p.value).filter((v) => Number.isFinite(v) && v > 0);

  let priceCv90d = 0;
  if (prices.length >= 2) {
    const mean = prices.reduce((sum, v) => sum + v, 0) / prices.length;
    const variance = prices.reduce((sum, v) => sum + (v - mean) ** 2, 0) / prices.length;
    const stdev = Math.sqrt(variance);
    priceCv90d = mean > 0 ? stdev / mean : 0;
  }

  let priceDropRate90d = 0;
  if (prices.length >= 2) {
    const first = prices[0]!;
    const last = prices[prices.length - 1]!;
    if (first > 0) priceDropRate90d = ((last - first) / first) * 100;
  }

  // セール率: 平均価格より 10% 以上下回った観測点の比率を近似。
  let saleRatio90d = 0;
  if (prices.length > 0) {
    const mean = prices.reduce((sum, v) => sum + v, 0) / prices.length;
    const saleCount = prices.filter((v) => v < mean * 0.9).length;
    saleRatio90d = saleCount / prices.length;
  }

  return {
    priceCv90d: Math.round(priceCv90d * 1000) / 1000,
    saleRatio90d: Math.round(saleRatio90d * 1000) / 1000,
    buyBoxConcentration: metrics.buyBoxConcentration,
    priceDropRate90d: Math.round(priceDropRate90d * 10) / 10,
  };
}

/**
 * Keepa /query で取得した KeepaProduct を AsinMetrics に変換する。
 * モックを骨格として使い、Keepa から取れた値を上書きする。
 * 詳細ページに飛んだ際は別途 fetchKeepaSeries で history が補完される。
 */
export function keepaProductToMetrics(product: KeepaProduct, fallbackCategory: string): AsinMetrics {
  const base = createMockMetrics({
    asin: product.asin,
    title: product.title ?? product.asin,
    brand: product.brand,
    category: product.category ?? fallbackCategory,
    overrides: { imageUrl: product.imageUrl },
  });

  if (typeof product.currentPrice === "number") base.currentPrice = Math.round(product.currentPrice);
  if (typeof product.currentSellerCount === "number") {
    base.sellerCount = Math.max(1, Math.round(product.currentSellerCount));
  }
  if (typeof product.currentReviewCount === "number") {
    base.reviewCount = Math.max(0, Math.round(product.currentReviewCount));
  }
  if (typeof product.currentRating === "number") base.rating = product.currentRating;
  if (typeof product.weightGrams === "number" && product.weightGrams > 0) {
    base.weightGrams = product.weightGrams;
    base.sizeTier =
      product.weightGrams > 1000
        ? "OVERSIZE"
        : product.weightGrams <= 500
          ? "SMALL_STANDARD"
          : "LARGE_STANDARD";
  }
  if (typeof product.monthlySold === "number" && product.monthlySold > 0) {
    base.estimatedMonthlySales = product.monthlySold;
    base.monthlySalesSource = "keepa";
  } else if (typeof product.currentBsr === "number" && product.currentBsr > 0) {
    // /query は BSR を返すので、 monthlySold が無くてもこちらで荒く推定可能
    const bsr = product.currentBsr;
    let estimated = 10;
    if (bsr < 100) estimated = 1500;
    else if (bsr < 1000) estimated = 500;
    else if (bsr < 5000) estimated = 200;
    else if (bsr < 20000) estimated = 80;
    else if (bsr < 100000) estimated = 30;
    base.estimatedMonthlySales = estimated;
    base.monthlySalesSource = "bsr";
  } else {
    base.monthlySalesSource = "seed";
  }
  if (product.isHazmat) base.isHazmat = true;

  // ブランド / カテゴリ ポリシーで mock seed 由来の structural 指標を上書き。
  // (例: KIOXIA の microSD なら brandStrength=85 / oemFeasibility=8 / complexity=HIGH)
  return applyBrandPolicy(base);
}
