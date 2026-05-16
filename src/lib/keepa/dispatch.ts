// Cron dispatcher 本体: token 残量 → Tier1/2 refresh → Discovery queue pop & ingestDiscover
// の優先度順に予算 (1 token / step) を消化する。
//
// /api/cron/dispatch (新規) と /api/cron/refresh (後方互換) の両方から呼ばれる。
//
// 設計方針:
//   - 純粋関数寄りで route から呼びやすい (env / network エラーは throw でなく summary に notes)
//   - 1 cron run の wall clock 上限 ≈ 60s (Vercel maxDuration) なので最大 50 token に制限
//   - Tier refresh は 1 ASIN ≈ 1 token、 Discovery は 1 ジョブ ≈ 5-10 token (/query) +
//     enrich=true なら + 1/ASIN。デフォルトは enrich=false なので 5-10 token で済む
//   - Discovery を発火するには budget が MIN_DISCOVERY_BUDGET 以上残っている必要あり
//     (途中で枯渇すると ingest 側 precheck で refused になるため)

import { fetchKeepaTokenStatus } from "@/lib/keepa/client";
import { ingestDiff, ingestDiscover } from "@/lib/keepa/ingest";
import { listProductsForRefresh } from "@/lib/supabase/repositories";
import {
  markDiscoveryJobDone,
  markDiscoveryJobFailed,
  pickNextDiscoveryJob,
} from "@/lib/supabase/discovery_queue";
import type { Tier } from "@/lib/types";

const TIER1_THRESHOLD_HOURS = 24;
const TIER2_THRESHOLD_HOURS = 24 * 7;
const BUDGET_RESERVE = 10;
const BUDGET_MAX_PER_RUN = 50;
/** /query 1 call の概算 token (実測 ~10)。 残 budget からこれを差し引いた分が enrich に回せる */
const QUERY_TOKEN_RESERVE = 10;
/** Discovery を発火するために残しておきたい token 数。 /query (10) + 最低 10 件 enrich を満たす */
const MIN_DISCOVERY_BUDGET = 20;

export interface RefreshStageSummary {
  tier1: { processed: number; skipped: string[] };
  tier2: { processed: number; skipped: string[] };
}

export interface DiscoveryStageSummary {
  pickedJob: { id: number; category: string; keyword: string | null } | null;
  ingested: number;
  skippedEmpty: number;
  refused?: string;
  error?: string;
}

export interface DispatchSummary {
  startedAt: string;
  durationMs: number;
  tokensBefore: number;
  tokensAfter: number;
  budget: number;
  refresh: RefreshStageSummary;
  discovery: DiscoveryStageSummary;
  notes: string[];
}

interface Stage {
  budgetUsed: number;
}

// ─── refresh stage (Tier1 → Tier2) ───────────────────────────────────

/**
 * Tier 1/2 リフレッシュ。 与えられた budget の範囲内で `ingestDiff` を呼び続け、
 * 1 ASIN 成功するごとに budget を 1 消化する。 戻り値で残 budget と件数を返す。
 */
export async function runRefreshStage(
  budget: number,
  now: Date = new Date(),
): Promise<RefreshStageSummary & Stage & { remainingBudget: number }> {
  const tier1Cutoff = new Date(now.getTime() - TIER1_THRESHOLD_HOURS * 3600 * 1000).toISOString();
  const tier2Cutoff = new Date(now.getTime() - TIER2_THRESHOLD_HOURS * 3600 * 1000).toISOString();
  const summary: RefreshStageSummary = {
    tier1: { processed: 0, skipped: [] },
    tier2: { processed: 0, skipped: [] },
  };
  let remaining = budget;

  const runTier = async (
    tier: Tier,
    cutoff: string,
    bucket: { processed: number; skipped: string[] },
  ): Promise<void> => {
    if (remaining <= 0) return;
    const asins = await listProductsForRefresh({ tier, olderThan: cutoff, limit: remaining });
    for (const asin of asins) {
      if (remaining <= 0) break;
      try {
        const r = await ingestDiff(asin);
        if (r.updated) {
          bucket.processed += 1;
          remaining -= 1;
        } else if (r.refusedReason) {
          // 途中で token 枯渇したらこれ以上の Tier 処理は無意味
          remaining = 0;
          return;
        }
      } catch (err) {
        bucket.skipped.push(asin);
        console.warn("[apde:dispatch] refresh ingestDiff failed", {
          tier,
          asin,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  await runTier(1, tier1Cutoff, summary.tier1);
  await runTier(2, tier2Cutoff, summary.tier2);

  const budgetUsed = budget - remaining;
  return { ...summary, budgetUsed, remainingBudget: remaining };
}

// ─── discovery stage (queue から 1 ジョブ pop) ────────────────────────

/**
 * Discovery queue から 1 ジョブだけ pop して ingestDiscover を呼ぶ。
 * budget が MIN_DISCOVERY_BUDGET 未満なら何もしない。
 */
export async function runDiscoveryStage(
  budget: number,
): Promise<DiscoveryStageSummary & Stage & { remainingBudget: number }> {
  const summary: DiscoveryStageSummary = { pickedJob: null, ingested: 0, skippedEmpty: 0 };

  if (budget < MIN_DISCOVERY_BUDGET) {
    return { ...summary, budgetUsed: 0, remainingBudget: budget };
  }

  const job = await pickNextDiscoveryJob();
  if (!job) {
    return { ...summary, budgetUsed: 0, remainingBudget: budget };
  }
  summary.pickedJob = { id: job.id, category: job.category, keyword: job.keyword };

  // Keepa /query は asinList だけ返すケースがあり、 enrich=false だと title/price が空の
  // まま 50 件全部弾かれる (実測値: ingested=0 skipped=50)。 そのため discovery では
  // **enrich を強制 ON** にし、 perPage は残 budget - /query 概算 で頭打ちにする。
  //   /query: ~10 token, enrich: 1 token/ASIN なので
  //   perPage = budget - 10 が enrich できる件数の上限。
  const enrichBudget = Math.max(0, budget - QUERY_TOKEN_RESERVE);
  const perPage = Math.min(job.per_page, enrichBudget, 100);

  try {
    const result = await ingestDiscover({
      category: job.category,
      keyword: job.keyword ?? undefined,
      minPrice: job.min_price ?? undefined,
      maxPrice: job.max_price ?? undefined,
      minReviews: job.min_reviews ?? undefined,
      maxReviews: job.max_reviews ?? undefined,
      perPage,
      enrich: true, // /query が asinList のみ返した場合に備え、 常に詳細を取りに行く
    });

    if (result.refusedReason) {
      // precheck で拒否された: queue は pending に戻して次回再試行
      summary.refused = result.refusedReason;
      await markDiscoveryJobFailed(job.id, result.refusedReason);
      // 拒否時は token を消費していないので budget はそのまま
      return { ...summary, budgetUsed: 0, remainingBudget: budget };
    }

    summary.ingested = result.ingested;
    summary.skippedEmpty = result.skippedEmpty ?? 0;
    await markDiscoveryJobDone(job.id, result.ingested);

    // 消費 token の正確な値は ingestDiscover 戻り値だけからは出ないので、
    // 「/query 1 call + enrich した件数」を概算消費する。
    // 実 budget の正確な追跡は最後の /token 再取得で吸収する。
    const estimated = QUERY_TOKEN_RESERVE + result.ingested;
    return { ...summary, budgetUsed: estimated, remainingBudget: Math.max(0, budget - estimated) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    summary.error = message;
    await markDiscoveryJobFailed(job.id, message);
    console.warn("[apde:dispatch] discovery ingestDiscover failed", {
      jobId: job.id,
      category: job.category,
      message,
    });
    return { ...summary, budgetUsed: 0, remainingBudget: budget };
  }
}

// ─── orchestrator ────────────────────────────────────────────────────

/**
 * Cron entry point: token を読んで budget を決め、 refresh → discovery を順に流す。
 * 例外は呼び出し側に投げず、 summary.notes に積む (cron は best-effort)。
 */
export async function runDispatch(): Promise<DispatchSummary> {
  const startedAt = new Date();
  const summary: DispatchSummary = {
    startedAt: startedAt.toISOString(),
    durationMs: 0,
    tokensBefore: 0,
    tokensAfter: 0,
    budget: 0,
    refresh: { tier1: { processed: 0, skipped: [] }, tier2: { processed: 0, skipped: [] } },
    discovery: { pickedJob: null, ingested: 0, skippedEmpty: 0 },
    notes: [],
  };

  // 1) Keepa /token (0 token)
  let tokensLeft = 0;
  try {
    const status = await fetchKeepaTokenStatus();
    tokensLeft = status.tokensLeft;
    summary.tokensBefore = tokensLeft;
  } catch (err) {
    summary.notes.push(
      `fetchKeepaTokenStatus failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    summary.durationMs = Date.now() - startedAt.getTime();
    return summary;
  }

  // 2) budget = min(left - 10, 50)
  const budget = Math.max(0, Math.min(tokensLeft - BUDGET_RESERVE, BUDGET_MAX_PER_RUN));
  summary.budget = budget;

  if (budget <= 0) {
    summary.notes.push(`insufficient budget: tokensLeft=${tokensLeft}`);
    summary.tokensAfter = tokensLeft;
    summary.durationMs = Date.now() - startedAt.getTime();
    return summary;
  }

  // 3) Refresh stage
  const refresh = await runRefreshStage(budget, startedAt);
  summary.refresh = { tier1: refresh.tier1, tier2: refresh.tier2 };
  let remainingBudget = refresh.remainingBudget;

  // 4) Discovery stage (余り budget で 1 ジョブ)
  const discovery = await runDiscoveryStage(remainingBudget);
  summary.discovery = {
    pickedJob: discovery.pickedJob,
    ingested: discovery.ingested,
    skippedEmpty: discovery.skippedEmpty,
    refused: discovery.refused,
    error: discovery.error,
  };
  remainingBudget = discovery.remainingBudget;

  // 5) /token で残量再取得 (best-effort)
  try {
    const after = await fetchKeepaTokenStatus();
    summary.tokensAfter = after.tokensLeft;
  } catch {
    summary.tokensAfter = tokensLeft - (budget - remainingBudget);
    summary.notes.push("post-run /token re-fetch failed; tokensAfter is estimate");
  }

  summary.durationMs = Date.now() - startedAt.getTime();
  console.info("[apde:dispatch] done", {
    tier1: summary.refresh.tier1.processed,
    tier2: summary.refresh.tier2.processed,
    discoveryIngested: summary.discovery.ingested,
    discoveryJobId: summary.discovery.pickedJob?.id,
    tokensBefore: summary.tokensBefore,
    tokensAfter: summary.tokensAfter,
    durationMs: summary.durationMs,
  });
  return summary;
}
