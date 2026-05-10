"use server";

import { revalidatePath } from "next/cache";
import { ingestDiff, ingestFull } from "@/lib/keepa/ingest";
import { generateInsight } from "@/lib/llm";
import {
  appendThread,
  upsertWatchlist,
} from "@/lib/supabase/repositories";
import { analyzeProduct } from "@/lib/integrations";
import type { WatchlistStatus } from "@/lib/types";

export async function askLlm(asin: string, prompt: string): Promise<void> {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  // 軽量応答 — 詳細な reportは別途生成。Q&A は要約をそのまま採用。
  const result = await analyzeProduct({ asin });
  const insight = await generateInsight({
    metrics: result.metrics,
    decision: result.decision,
    competitionLevel: result.competitionLevel,
    summary: `${result.summary} 質問: ${trimmed}`,
    scoreTotal: result.score,
  });
  await appendThread({
    asin,
    prompt: trimmed,
    response: insight.report,
  });
  revalidatePath(`/products/${asin}`);
}

export async function addToWatchlist(asin: string, status: WatchlistStatus = "candidate") {
  await upsertWatchlist({ asin, status });
  revalidatePath(`/products/${asin}`);
  revalidatePath("/watchlist");
  revalidatePath("/");
}

export interface IngestActionResult {
  ok: boolean;
  error?: string;
  pricePoints?: number;
  bsrPoints?: number;
  sellerPoints?: number;
  refusedReason?: string;
  tokensLeft?: number;
}

/** R5: 詳細ページ「履歴を更新」ボタン → /product?history=1 (1 token) */
export async function runIngestFull(asin: string): Promise<IngestActionResult> {
  try {
    const r = await ingestFull(asin);
    if (r.refusedReason) {
      return {
        ok: false,
        error: r.refusedReason,
        refusedReason: r.refusedReason,
        tokensLeft: r.tokensLeft,
      };
    }
    revalidatePath(`/products/${asin}`);
    return {
      ok: true,
      pricePoints: r.pricePoints,
      bsrPoints: r.bsrPoints,
      sellerPoints: r.sellerPoints,
      tokensLeft: r.tokensLeft,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** R5: 詳細ページ「最新値を取得」ボタン → /product?history=0 (1 token) */
export async function runIngestDiff(asin: string): Promise<IngestActionResult> {
  try {
    const r = await ingestDiff(asin);
    if (r.refusedReason) {
      return {
        ok: false,
        error: r.refusedReason,
        refusedReason: r.refusedReason,
        tokensLeft: r.tokensLeft,
      };
    }
    revalidatePath(`/products/${asin}`);
    return { ok: true, tokensLeft: r.tokensLeft };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
