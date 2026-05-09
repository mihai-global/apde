// Cron 入口: 監視リスト全件を再評価し、変化サマリを返す。
// `Authorization: Bearer ${CRON_SECRET}` を要求。空 (mockMode) のときは 503。
import { env } from "@/lib/env";
import { refreshCategories } from "@/lib/integrations";
import { listWatchlist } from "@/lib/supabase/repositories";
import type { RefreshRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  if (!env.cronSecret) {
    return Response.json(
      { error: "CRON_SECRET is not configured. Set it in env to enable /api/refresh." },
      { status: 503 },
    );
  }
  if (auth !== `Bearer ${env.cronSecret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<RefreshRequest>;
  const targetCategories = Array.isArray(body.categories) ? body.categories.filter(Boolean) : [];

  const watchlist = await listWatchlist();
  const watchedCategories = Array.from(new Set(watchlist.map((_w) => _w.asin))).slice(0, 20);

  const result = await refreshCategories(targetCategories.length > 0 ? targetCategories : []);
  const report = {
    ...result,
    watchedAsins: watchedCategories.length,
  };
  return Response.json(report, { status: 200 });
}
