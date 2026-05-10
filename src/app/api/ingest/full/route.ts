// POST /api/ingest/full?asin=ASIN
// Header: x-cron-secret: ${CRON_SECRET}
// 1 ASIN を /product?history=1 で取得し、 *_history テーブルに展開する (1 token)。
// 詳細ページの「履歴を更新」 + 90 日 cycle Cron から呼ぶ。
import { env } from "@/lib/env";
import { ingestFull } from "@/lib/keepa/ingest";

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
    const result = await ingestFull(asin);
    return Response.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[apde:ingest:full] failed", { asin, message });
    return Response.json({ error: message }, { status: 500 });
  }
}
