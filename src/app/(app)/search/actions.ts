"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { discoverProducts } from "@/lib/integrations";
import { ingestDiscover, type IngestDiscoverInput } from "@/lib/keepa/ingest";
import { listDictionary, insertDiscoveryRun } from "@/lib/supabase/repositories";

export interface RunDiscoverInput {
  category: string;
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
  maxReviews?: number;
  minReviews?: number;
  limit?: number;
  applyDictionary: boolean;
}

/**
 * @deprecated R2 で `runIngestDiscover` に置き換え予定。
 * 既存の `/search/[runId]` スナップショット運用と互換のため残置。
 */
export async function runDiscover(input: RunDiscoverInput) {
  const dictionary = await listDictionary();
  const result = await discoverProducts(input, { dictionary });
  const row = await insertDiscoveryRun({
    category: result.category,
    filters: result.filters,
    generated_keywords: result.keywords,
    candidate_count: result.candidates.length,
    candidates: result.candidates,
    excluded_candidates: result.excluded,
    duration_ms: result.durationMs,
    source: result.source,
  });
  redirect(`/search/${row.id}`);
}

export interface RunIngestDiscoverInput extends IngestDiscoverInput {
  /** UI から入力された perPage は IngestDiscoverInput.perPage に対応する。 */
}

export interface RunIngestDiscoverResult {
  ok: boolean;
  ingested: number;
  asins: string[];
  durationMs: number;
  error?: string;
  /** Keepa token 残量不足で実行を拒否したときのメッセージ */
  refusedReason?: string;
  tokensLeft?: number;
  /** title/price が空でスキップした ASIN 数 */
  skippedEmpty?: number;
}

/**
 * 新カテゴリ調査ボタンから呼ぶ server action。
 * Keepa /query 1 コール → DB に永続化 → /search を revalidate。
 * 結果ページへ redirect せず、 /search 上で「N 件追加されました」と表示する想定。
 */
export async function runIngestDiscover(
  input: RunIngestDiscoverInput,
): Promise<RunIngestDiscoverResult> {
  try {
    const result = await ingestDiscover(input);
    revalidatePath("/search");
    return {
      ok: !result.refusedReason,
      ingested: result.ingested,
      asins: result.asins,
      durationMs: result.durationMs,
      refusedReason: result.refusedReason,
      tokensLeft: result.tokensLeft,
      skippedEmpty: result.skippedEmpty,
      error: result.refusedReason,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[apde:search:runIngestDiscover] failed", { message });
    return {
      ok: false,
      ingested: 0,
      asins: [],
      durationMs: 0,
      error: message,
    };
  }
}
