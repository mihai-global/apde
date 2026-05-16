"use server";

import { revalidatePath } from "next/cache";
import { recomputeMarketAnalysis } from "@/lib/keepa/ingest";
import {
  clearDiscoveryQueue as repoClearDiscoveryQueue,
  enqueueDiscoveryJobs,
} from "@/lib/supabase/discovery_queue";
import { CATEGORIES } from "@/lib/keepa/categories";
import { PRICE_BANDS } from "@/lib/keepa/price-bands";
import { getServiceRoleSupabase } from "@/lib/supabase/server";
import { mockMode } from "@/lib/env";
import { getMockStore } from "@/lib/supabase/mock-store";
import type { KeepaSnapshotRow } from "@/lib/types";

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

export interface PurgeEmptyResult {
  ok: boolean;
  deleted: number;
  error?: string;
}

/**
 * keepa_snapshot.current_new_yen IS NULL かつ products.title が ASIN 文字列のままの
 * ノイズ ASIN を削除する (cascade で snapshot / market_analysis / history も消える)。
 * Keepa は呼ばない (0 token)。
 */
export async function purgeEmptyAsins(): Promise<PurgeEmptyResult> {
  if (mockMode.supabase) {
    const store = getMockStore();
    const asinsToDelete: string[] = [];
    for (const [asin, snap] of store.keepaSnapshot.entries()) {
      const product = store.products.get(asin);
      const titleIsAsin = !product || product.title === asin;
      const noPrice = !snap.current_new_yen && !snap.current_amazon_yen;
      if (titleIsAsin && noPrice) asinsToDelete.push(asin);
    }
    for (const asin of asinsToDelete) {
      store.products.delete(asin);
      store.keepaSnapshot.delete(asin);
      store.marketAnalysis.delete(asin);
    }
    revalidatePath("/diagnostics");
    revalidatePath("/search");
    return { ok: true, deleted: asinsToDelete.length };
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) {
    return { ok: false, deleted: 0, error: "Supabase service role client unavailable" };
  }
  // snapshot に price が無い行を抽出 → 同じ asin の products を delete (cascade)
  const { data: emptySnaps, error: e1 } = await supabase
    .from("keepa_snapshot")
    .select("asin,current_new_yen,current_amazon_yen")
    .is("current_new_yen", null)
    .is("current_amazon_yen", null);
  if (e1) return { ok: false, deleted: 0, error: e1.message };

  type Snap = Pick<KeepaSnapshotRow, "asin" | "current_new_yen" | "current_amazon_yen">;
  const candidates = ((emptySnaps ?? []) as Snap[]).map((s) => s.asin);
  if (candidates.length === 0) {
    return { ok: true, deleted: 0 };
  }
  // title が ASIN そのものになっている (= Keepa から title 取れなかった)もののみ削除
  const { data: products, error: e2 } = await supabase
    .from("products")
    .select("asin,title")
    .in("asin", candidates);
  if (e2) return { ok: false, deleted: 0, error: e2.message };

  const toDelete = ((products ?? []) as Array<{ asin: string; title: string }>)
    .filter((p) => p.title === p.asin)
    .map((p) => p.asin);
  if (toDelete.length === 0) {
    return { ok: true, deleted: 0 };
  }
  const { error: e3 } = await supabase.from("products").delete().in("asin", toDelete);
  if (e3) return { ok: false, deleted: 0, error: e3.message };

  revalidatePath("/diagnostics");
  revalidatePath("/search");
  return { ok: true, deleted: toDelete.length };
}

// ─── R6: discovery_queue 管理 ──────────────────────────────────────────

export interface EnqueueSeedsResult {
  ok: boolean;
  added: number;
  error?: string;
}

/**
 * 14 カテゴリ × 4 価格帯 = 56 エントリの初期 seed を discovery_queue に投入。
 * 既存と (category, keyword=null, min_price, max_price) が完全一致するエントリは
 * スキップするので、 何度叩いても重複しない。
 */
export async function enqueueDiscoverySeeds(): Promise<EnqueueSeedsResult> {
  // R7: PRICE_BANDS (src/lib/keepa/price-bands.ts) を一次ソースに統一。
  // db/discovery_seed.sql の 4 バンドと完全一致させること。
  const jobs = CATEGORIES.flatMap((c) =>
    PRICE_BANDS.map((b) => ({
      category: c.label,
      minPrice: b.min,
      maxPrice: b.max,
      perPage: 50,
      priority: 50,
    })),
  );

  try {
    const added = await enqueueDiscoveryJobs(jobs);
    revalidatePath("/diagnostics");
    return { ok: true, added };
  } catch (err) {
    return {
      ok: false,
      added: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface ClearQueueResult {
  ok: boolean;
  deleted: number;
  error?: string;
}

/**
 * discovery_queue 全行を削除。 やり直し / リセット用。
 */
export async function clearDiscoveryQueue(): Promise<ClearQueueResult> {
  try {
    const deleted = await repoClearDiscoveryQueue();
    revalidatePath("/diagnostics");
    return { ok: true, deleted };
  } catch (err) {
    return {
      ok: false,
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
