"use server";

import { revalidatePath } from "next/cache";
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
