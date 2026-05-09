// 利益性計算 (要件 v1.1 §4.4)。スコア計算とは独立してロジックを保持する。
import type { AsinMetrics, ProfitBreakdown } from "@/lib/types";

export interface ProfitInput {
  costRate?: number; // 想定原価率 (%)、デフォルト 30
  cvr?: number; // 想定 CVR (%)、デフォルト 10
  cpc?: number; // 想定 CPC (¥)、デフォルト 100
}

const AMAZON_REFERRAL_RATE = 0.1; // カテゴリ別を持つまでは 10% 一律近似。

// FBA 手数料: 重量・サイズ区分から SP-API Product Fees 接続前の概算。
function estimateFbaFee(weightGrams: number, sizeTier: AsinMetrics["sizeTier"]): number {
  if (sizeTier === "OVERSIZE" || weightGrams > 1000) return 720;
  if (weightGrams <= 250) return 290;
  if (weightGrams <= 500) return 380;
  return 480;
}

export const PROFIT_DEFAULTS = { costRate: 30, cvr: 10, cpc: 100 } as const;

export function computeProfit(metrics: AsinMetrics, input: ProfitInput = {}): ProfitBreakdown {
  const costRate = input.costRate ?? PROFIT_DEFAULTS.costRate;
  const cvr = input.cvr ?? PROFIT_DEFAULTS.cvr;
  const cpc = input.cpc ?? PROFIT_DEFAULTS.cpc;

  const sellingPrice = Math.max(0, metrics.currentPrice);
  const amazonReferralFee = Math.round(sellingPrice * AMAZON_REFERRAL_RATE);
  const fbaFee = estimateFbaFee(metrics.weightGrams, metrics.sizeTier);
  const cogs = Math.round(sellingPrice * (costRate / 100));
  const adSpendPerUnit = Math.round(cpc / Math.max(cvr / 100, 0.001));
  const grossProfit = sellingPrice - amazonReferralFee - fbaFee - cogs;
  const netProfitPerUnit = grossProfit - adSpendPerUnit;
  const netMarginRate = sellingPrice > 0 ? netProfitPerUnit / sellingPrice : 0;
  const netProfitMonthly = netProfitPerUnit * Math.max(metrics.estimatedMonthlySales, 0);

  return {
    sellingPrice,
    amazonReferralFee,
    fbaFee,
    cogs,
    grossProfit,
    adSpendPerUnit,
    netProfitPerUnit,
    netMarginRate,
    netProfitMonthly,
    costRate,
    cvr,
    cpc,
  };
}
