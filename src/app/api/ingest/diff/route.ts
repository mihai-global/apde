// POST /api/ingest/diff?asin=ASIN
// Header: x-cron-secret: ${CRON_SECRET}
// 1 ASIN を /product?history=0 で取得し、 keepa_snapshot のみ更新する (1 token)。
// Tier 1 (24h) / Tier 2 (7d) Cron + 詳細ページの「最新値を取得」から呼ぶ。
import { env } from "@/lib/env";
import { ingestDiff } from "@/lib/keepa/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const url = new URL(request.url);
  const asin = url.searchParams.get("asin")?.trim() ?? "";
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return Response.json({ error: "invalid asin (expected 10 alphanumeric chars)" }, { status: 400 });
  }

  try {
    const result = await ingestDiff(asin);
    return Response.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[apde:ingest:diff] failed", { asin, message });
    return Response.json({ error: message }, { status: 500 });
  }
}
