// POST /api/ingest/recompute?asin=ASIN
// Header: x-cron-secret: ${CRON_SECRET}
// Keepa を呼ばず、 DB の keepa_snapshot から market_analysis を再計算する (0 token)。
// 評価式 (5 軸 / ゲート / weight) を変えたあとに全 ASIN を一括再計算するときに使う。
import { env } from "@/lib/env";
import { recomputeMarketAnalysis } from "@/lib/keepa/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!env.cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== env.cronSecret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const asin = url.searchParams.get("asin")?.trim() ?? "";
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return Response.json({ error: "invalid asin (expected 10 alphanumeric chars)" }, { status: 400 });
  }

  try {
    const result = await recomputeMarketAnalysis(asin);
    return Response.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[apde:ingest:recompute] failed", { asin, message });
    return Response.json({ error: message }, { status: 500 });
  }
}
