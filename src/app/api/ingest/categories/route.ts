// GET /api/ingest/categories
// Header: x-cron-secret: ${CRON_SECRET}  (auth で保護、 1 token 消費)
// Amazon JP のルートカテゴリ一覧を Keepa から取得して返す。
// categories.ts の rootCategory ID 検証/修正用 (curl で叩く)。
import { env } from "@/lib/env";
import { fetchKeepaRootCategories } from "@/lib/keepa/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!env.cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== env.cronSecret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.keepa.configured) {
    return Response.json({ error: "Keepa API key not configured" }, { status: 503 });
  }

  try {
    const cats = await fetchKeepaRootCategories();
    // 商品数で降順ソートしておくと「主要カテゴリ」が上位に並ぶ
    cats.sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0));
    return Response.json(
      { count: cats.length, categories: cats },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
