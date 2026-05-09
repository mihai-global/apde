// API コスト記録ユーティリティ。各 API クライアントから fire-and-forget で呼ぶ。
import { recordApiUsage } from "@/lib/supabase/repositories";
import type { ApiProvider } from "@/lib/types";

export async function trackUsage(provider: ApiProvider, endpoint: string, costEstimate: number): Promise<void> {
  try {
    await recordApiUsage({ provider, endpoint, cost_estimate: Math.max(0, Math.round(costEstimate * 100) / 100) });
  } catch (err) {
    // ログだけ残し、メイン処理には伝播させない (要件 5.2 部分結果優先)
    console.warn("[apde] failed to record api usage", { provider, endpoint, err });
  }
}

const KEEPA_TOKEN_TO_JPY = 1.5; // 1 token あたり ¥1.5 で概算 (契約プラン依存)
const GEMINI_PER_1K_INPUT_JPY = 0.6;
const GEMINI_PER_1K_OUTPUT_JPY = 1.8;

export const usage = {
  keepa(endpoint: string, tokens: number) {
    return trackUsage("keepa", endpoint, tokens * KEEPA_TOKEN_TO_JPY);
  },
  gemini(endpoint: string, inputTokens: number, outputTokens: number) {
    const cost = (inputTokens / 1000) * GEMINI_PER_1K_INPUT_JPY + (outputTokens / 1000) * GEMINI_PER_1K_OUTPUT_JPY;
    return trackUsage("gemini", endpoint, cost);
  },
  raw(provider: ApiProvider, endpoint: string, costJpy: number) {
    return trackUsage(provider, endpoint, costJpy);
  },
};
