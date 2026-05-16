// POST /api/cron/dispatch
// Header: x-cron-secret: ${CRON_SECRET}
// GitHub Actions (.github/workflows/keepa-dispatch.yml) から 15 分おきに呼ぶ。
//
// 既存 /api/cron/refresh が Tier1/2 リフレッシュのみだったのに対し、こちらは
// 「Tier1/2 リフレッシュ → 余った budget で Discovery キュー 1 ジョブ消化」まで一気通貫。
// 実装は src/lib/keepa/dispatch.ts:runDispatch() に切り出してあるのでテストしやすい。
//
// 失敗時も 200 + notes でサマリだけ返す (cron は best-effort)。
// 認証/設定不備のみ非 2xx を返す。
import { env } from "@/lib/env";
import { runDispatch } from "@/lib/keepa/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 1 run で最大 50 token = 最大 50 ASIN の ingestDiff + 1 ジョブの ingestDiscover を回す可能性。
// Vercel Hobby の上限 60s に張り付くこともあるので明示。
export const maxDuration = 60;

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

  const summary = await runDispatch();
  return Response.json(summary, { status: 200 });
}
