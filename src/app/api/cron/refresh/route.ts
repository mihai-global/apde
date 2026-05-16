// POST /api/cron/refresh
// Header: x-cron-secret: ${CRON_SECRET}
//
// 後方互換用エンドポイント (R5 から残置)。 R6 以降は `/api/cron/dispatch` を
// 主軸とし、こちらは Tier1/2 リフレッシュのみを実行する。
//
// 実体は src/lib/keepa/dispatch.ts:runRefreshStage() を呼ぶ薄いラッパ。
// レスポンスの形は旧バージョンと互換 (tier1.processed / tier2.skipped / tokensBefore など)
// を保つので、 既存の GitHub Actions workflow (keepa-refresh.yml) はそのまま動く。
import { env } from "@/lib/env";
import { fetchKeepaTokenStatus } from "@/lib/keepa/client";
import { runRefreshStage } from "@/lib/keepa/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const budget = Math.max(0, Math.min(tokensLeft - BUDGET_RESERVE, BUDGET_MAX_PER_RUN));
  summary.budget = budget;

  if (budget <= 0) {
    summary.durationMs = Date.now() - startedAt.getTime();
    summary.tokensAfter = tokensLeft;
    console.info("[apde:cron:refresh] skip: insufficient budget", { tokensLeft });
    return Response.json(summary, { status: 200 });
  }

  const refresh = await runRefreshStage(budget, startedAt);
  summary.tier1 = refresh.tier1;
  summary.tier2 = refresh.tier2;

  try {
    const after = await fetchKeepaTokenStatus();
    summary.tokensAfter = after.tokensLeft;
  } catch {
    summary.tokensAfter = tokensLeft - (budget - refresh.remainingBudget);
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
