// POST /api/cron/refresh
// Header: x-cron-secret: ${CRON_SECRET}
// GitHub Actions / Supabase pg_cron から呼ぶ Tier-aware リフレッシュ。
//
// 流れ:
//  1) Keepa /token で残量取得 (0 token 消費)
//  2) budget = min(remaining - 10, 50) (10 は緊急用バッファ)
//  3) Tier 1 (sourcing/live): keepa_last_diff_at < NOW - 24h を古い順に取り、
//     1 ASIN ずつ ingestDiff (1 token 消費 / ASIN)
//  4) budget が残っていれば Tier 2 (candidate, 7d) を処理
//  5) 完了 ASIN 数 / 残 budget を返す
//
// 失敗した ASIN はスキップして次へ進む (cron は best-effort)。
import { env } from "@/lib/env";
import { fetchKeepaTokenStatus } from "@/lib/keepa/client";
import { ingestDiff } from "@/lib/keepa/ingest";
import { listProductsForRefresh } from "@/lib/supabase/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cron は 30 秒以内に終わる想定だが、 Tier 1+2 で 50 ASIN 回る可能性があるため余裕を持つ
export const maxDuration = 60;

const TIER1_THRESHOLD_HOURS = 24;
const TIER2_THRESHOLD_HOURS = 24 * 7;
const BUDGET_RESERVE = 10;
const BUDGET_MAX_PER_RUN = 50;

interface RefreshSummary {
  startedAt: string;
  durationMs: number;
  tokensBefore: number;
  tokensAfter: number;
  budget: number;
  tier1: { processed: number; skipped: string[] };
  tier2: { processed: number; skipped: string[] };
}

export async function POST(request: Request): Promise<Response> {
  if (!env.cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== env.cronSecret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.keepa.configured) {
    return Response.json({ error: "Keepa API key not configured" }, { status: 503 });
  }

  const startedAt = new Date();
  const summary: RefreshSummary = {
    startedAt: startedAt.toISOString(),
    durationMs: 0,
    tokensBefore: 0,
    tokensAfter: 0,
    budget: 0,
    tier1: { processed: 0, skipped: [] },
    tier2: { processed: 0, skipped: [] },
  };

  // 1) /token で残量を取得
  let tokensLeft = 0;
  try {
    const status = await fetchKeepaTokenStatus();
    tokensLeft = status.tokensLeft;
    summary.tokensBefore = tokensLeft;
  } catch (err) {
    console.warn("[apde:cron:refresh] /token failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    summary.durationMs = Date.now() - startedAt.getTime();
    return Response.json(
      { ...summary, error: "failed to fetch token status; aborting" },
      { status: 502 },
    );
  }

  let budget = Math.max(0, Math.min(tokensLeft - BUDGET_RESERVE, BUDGET_MAX_PER_RUN));
  summary.budget = budget;

  if (budget <= 0) {
    summary.durationMs = Date.now() - startedAt.getTime();
    summary.tokensAfter = tokensLeft;
    console.info("[apde:cron:refresh] skip: insufficient budget", { tokensLeft });
    return Response.json(summary, { status: 200 });
  }

  const tier1Cutoff = new Date(
    startedAt.getTime() - TIER1_THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const tier2Cutoff = new Date(
    startedAt.getTime() - TIER2_THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // 2) Tier 1
  const tier1Asins = await listProductsForRefresh({ tier: 1, olderThan: tier1Cutoff, limit: budget });
  for (const asin of tier1Asins) {
    if (budget <= 0) break;
    try {
      await ingestDiff(asin);
      summary.tier1.processed += 1;
      budget -= 1;
    } catch (err) {
      summary.tier1.skipped.push(asin);
      console.warn("[apde:cron:refresh] tier1 ingestDiff failed", {
        asin,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3) Tier 2
  if (budget > 0) {
    const tier2Asins = await listProductsForRefresh({ tier: 2, olderThan: tier2Cutoff, limit: budget });
    for (const asin of tier2Asins) {
      if (budget <= 0) break;
      try {
        await ingestDiff(asin);
        summary.tier2.processed += 1;
        budget -= 1;
      } catch (err) {
        summary.tier2.skipped.push(asin);
        console.warn("[apde:cron:refresh] tier2 ingestDiff failed", {
          asin,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 4) /token で残量再取得 (best-effort)
  try {
    const after = await fetchKeepaTokenStatus();
    summary.tokensAfter = after.tokensLeft;
  } catch {
    summary.tokensAfter = tokensLeft - summary.tier1.processed - summary.tier2.processed;
  }

  summary.durationMs = Date.now() - startedAt.getTime();
  console.info("[apde:cron:refresh] done", {
    tier1: summary.tier1.processed,
    tier2: summary.tier2.processed,
    durationMs: summary.durationMs,
    tokensBefore: summary.tokensBefore,
    tokensAfter: summary.tokensAfter,
  });
  return Response.json(summary, { status: 200 });
}
