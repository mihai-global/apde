// POST /api/ingest/discover
// Body: { category?: string; keyword?: string; minPrice?: number; maxPrice?: number;
//         minReviews?: number; maxReviews?: number; perPage?: number }
// Header: x-cron-secret: ${CRON_SECRET}
// 1 コール 5〜10 token 消費 (Keepa /query)。 100〜200 件を products / keepa_snapshot /
// market_analysis に永続化する。 Cron / 新カテゴリ調査ボタン / curl から呼ばれる。
import { env } from "@/lib/env";
import { ingestDiscover, type IngestDiscoverInput } from "@/lib/keepa/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 100 件 ingest で /query → bulk /product → 100 ASIN の DB 書き込みが走るので
// Vercel Hobby (60s 上限) いっぱいを確保しておく。
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!env.cronSecret) {
    return Response.json(
      { error: "CRON_SECRET is not configured. Set it in env to enable /api/ingest/*." },
      { status: 503 },
    );
  }
  if (request.headers.get("x-cron-secret") !== env.cronSecret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.keepa.configured) {
    return Response.json({ error: "Keepa API key not configured" }, { status: 503 });
  }

  let body: Partial<IngestDiscoverInput> = {};
  try {
    body = (await request.json()) as Partial<IngestDiscoverInput>;
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  try {
    const result = await ingestDiscover({
      category: typeof body.category === "string" ? body.category : undefined,
      keyword: typeof body.keyword === "string" ? body.keyword : undefined,
      minPrice: typeof body.minPrice === "number" ? body.minPrice : undefined,
      maxPrice: typeof body.maxPrice === "number" ? body.maxPrice : undefined,
      minReviews: typeof body.minReviews === "number" ? body.minReviews : undefined,
      maxReviews: typeof body.maxReviews === "number" ? body.maxReviews : undefined,
      perPage: typeof body.perPage === "number" ? body.perPage : undefined,
    });
    return Response.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[apde:ingest:discover] failed", { message });
    return Response.json({ error: message }, { status: 500 });
  }
}
