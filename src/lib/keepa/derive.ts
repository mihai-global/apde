// Keepa 時系列から派生指標 (CV, セール頻度, 価格下落率, Buy Box 集中度) を計算する。
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
