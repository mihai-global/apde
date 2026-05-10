"use server";

import { revalidatePath } from "next/cache";
import { recomputeMarketAnalysis } from "@/lib/keepa/ingest";
import { getServiceRoleSupabase } from "@/lib/supabase/server";
import { mockMode } from "@/lib/env";
import { getMockStore } from "@/lib/supabase/mock-store";

export interface RecomputeAllResult {
  ok: boolean;
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  error?: string;
}

/**
 * R5 polish: market_analysis に登録されている全 ASIN について recomputeMarketAnalysis を呼ぶ。
 * Keepa は 0 token 消費 (DB のみ参照)。 評価式 / brand-policy 変更後の一括反映に使う。
 */
export async function recomputeAllMarketAnalysis(): Promise<RecomputeAllResult> {
  const start = Date.now();
  let asins: string[] = [];

  if (mockMode.supabase) {
    asins = Array.from(getMockStore().marketAnalysis.keys());
  } else {
    const supabase = getServiceRoleSupabase();
    if (!supabase) {
      return {
        ok: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        durationMs: 0,
        error: "Supabase service role client unavailable",
      };
    }
    const { data, error } = await supabase
      .from("market_analysis")
      .select("asin");
    if (error) {
      return {
        ok: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        durationMs: 0,
        error: error.message,
      };
    }
    asins = ((data ?? []) as Array<{ asin: string }>).map((r) => r.asin);
  }

  // バッチ並列で実行 (Supabase の同時接続枯渇を避けて 10 並列)
  const BATCH = 10;
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < asins.length; i += BATCH) {
    const slice = asins.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((asin) =>
        recomputeMarketAnalysis(asin).catch((err) => {
          console.warn("[apde:diag:recomputeAll] failed", {
            asin,
            message: err instanceof Error ? err.message : String(err),
          });
          return null;
        }),
      ),
    );
    for (const r of results) {
      if (r && r.recomputed) succeeded += 1;
      else failed += 1;
    }
  }

  revalidatePath("/diagnostics");
  revalidatePath("/search");
  return {
    ok: true,
    total: asins.length,
    succeeded,
    failed,
    durationMs: Date.now() - start,
  };
}
