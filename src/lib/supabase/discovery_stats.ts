// /discovery (探索進捗) ページ専用の集計層 (R7)。
//
// 既存 repositories.ts の `getMarketDistribution` / `listApiUsageThisMonth` の
// mockMode pattern をそのまま踏襲する。
//
// 注意:
//  - すべての関数は失敗時に「空の結果」を返す (throw しない)。 ダッシュボード系
//    ページは部分的に壊れても他カードが見える方が良い。
//  - `getCategoryPriceBandHeatmap()` は products + keepa_snapshot を全件 select
//    して JS 側で group by する。 R7 時点 (~数千行) では十分速い。 5,000 行超で
//    重くなったら materialize view に切り替える。

import { mockMode } from "@/lib/env";
import { CATEGORIES } from "@/lib/keepa/categories";
import { PRICE_BANDS, priceToBand, type PriceBandId } from "@/lib/keepa/price-bands";
import { getMockStore } from "@/lib/supabase/mock-store";
import { getServiceRoleSupabase } from "@/lib/supabase/server";
import type { DiscoveryQueueStatus, MarketDecision } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ─── (a) カバレッジ概要 ──────────────────────────────────────────────

export interface DiscoveryCoverage {
  /** market_analysis 行数 */
  totalAsins: number;
  /** 直近 24h で computed_at が更新された行数 (新規 + 再評価含む) */
  added24h: number;
  go: number;
  cond: number;
  noGo: number;
  avgScore: number;
}

export async function getDiscoveryCoverage(): Promise<DiscoveryCoverage> {
  const cutoff = new Date(Date.now() - DAY_MS).toISOString();
  const empty: DiscoveryCoverage = {
    totalAsins: 0,
    added24h: 0,
    go: 0,
    cond: 0,
    noGo: 0,
    avgScore: 0,
  };

  if (mockMode.supabase) {
    const rows = Array.from(getMockStore().marketAnalysis.values());
    let go = 0,
      cond = 0,
      noGo = 0,
      sum = 0,
      added24h = 0;
    for (const r of rows) {
      if (r.decision === "go") go += 1;
      else if (r.decision === "cond") cond += 1;
      else if (r.decision === "no_go") noGo += 1;
      sum += Number(r.market_score ?? 0);
      if (r.computed_at && r.computed_at >= cutoff) added24h += 1;
    }
    return {
      totalAsins: rows.length,
      added24h,
      go,
      cond,
      noGo,
      avgScore: rows.length > 0 ? Math.round((sum / rows.length) * 10) / 10 : 0,
    };
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) return empty;

  const [go, cond, noGo, all, added] = await Promise.all([
    supabase.from("market_analysis").select("asin", { count: "exact", head: true }).eq("decision", "go"),
    supabase.from("market_analysis").select("asin", { count: "exact", head: true }).eq("decision", "cond"),
    supabase.from("market_analysis").select("asin", { count: "exact", head: true }).eq("decision", "no_go"),
    supabase.from("market_analysis").select("market_score"),
    supabase.from("market_analysis").select("asin", { count: "exact", head: true }).gte("computed_at", cutoff),
  ]);

  const scores = ((all.data ?? []) as Array<{ market_score: number | null }>)
    .map((r) => Number(r.market_score ?? 0))
    .filter((n) => Number.isFinite(n));
  const avg = scores.length > 0 ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
  const totalAsins = (go.count ?? 0) + (cond.count ?? 0) + (noGo.count ?? 0);

  return {
    totalAsins,
    added24h: added.count ?? 0,
    go: go.count ?? 0,
    cond: cond.count ?? 0,
    noGo: noGo.count ?? 0,
    avgScore: Math.round(avg * 10) / 10,
  };
}

// ─── (b) カテゴリ × 価格帯 ヒートマップ (14 × 4) ──────────────────────

export interface HeatmapCell {
  /** products.category と一致するラベル (CATEGORIES.label を使用) */
  category: string;
  bandId: PriceBandId;
  /** 該当バンドに入る ASIN 件数 (products + snapshot で確認できたもの) */
  asinCount: number;
  decision: { go: number; cond: number; noGo: number };
  /** 同じ条件の discovery_queue 行があれば status を載せる */
  queueStatus: DiscoveryQueueStatus | null;
  lastRunAt: string | null;
  ingestedCount: number | null;
}

interface ProductRowMini {
  asin: string;
  category: string;
}
interface SnapshotMini {
  asin: string;
  current_new_yen: number | null;
  current_amazon_yen: number | null;
}
interface QueueRowMini {
  category: string;
  min_price: number | null;
  max_price: number | null;
  status: DiscoveryQueueStatus;
  last_run_at: string | null;
  ingested_count: number | null;
}
interface AnalysisRowMini {
  asin: string;
  decision: MarketDecision | null;
}

function emptyGrid(): HeatmapCell[] {
  return CATEGORIES.flatMap((cat) =>
    PRICE_BANDS.map((band) => ({
      category: cat.label,
      bandId: band.id,
      asinCount: 0,
      decision: { go: 0, cond: 0, noGo: 0 },
      queueStatus: null as DiscoveryQueueStatus | null,
      lastRunAt: null as string | null,
      ingestedCount: null as number | null,
    })),
  );
}

function cellKey(category: string, bandId: PriceBandId): string {
  return `${category}|${bandId}`;
}

function queueBandKey(min: number | null, max: number | null): PriceBandId | undefined {
  const band = PRICE_BANDS.find((b) => b.min === min && b.max === max);
  return band?.id;
}

export async function getCategoryPriceBandHeatmap(): Promise<HeatmapCell[]> {
  const grid = emptyGrid();
  const byKey = new Map(grid.map((c) => [cellKey(c.category, c.bandId), c]));

  if (mockMode.supabase) {
    const store = getMockStore();
    const decisionByAsin = new Map<string, MarketDecision | null>();
    for (const r of store.marketAnalysis.values()) {
      decisionByAsin.set(r.asin, r.decision);
    }
    for (const [asin, prod] of store.products.entries()) {
      const snap = store.keepaSnapshot.get(asin);
      const price = snap?.current_new_yen ?? snap?.current_amazon_yen ?? null;
      const band = priceToBand(price);
      if (!band) continue;
      // 完全一致 (CATEGORIES.label) のみ集計。 旧 mock の自由カテゴリは無視。
      const cell = byKey.get(cellKey(prod.category, band.id));
      if (!cell) continue;
      cell.asinCount += 1;
      const d = decisionByAsin.get(asin);
      if (d === "go") cell.decision.go += 1;
      else if (d === "cond") cell.decision.cond += 1;
      else if (d === "no_go") cell.decision.noGo += 1;
    }
    // mock では discovery_queue は別 store。 queue overlay は省略。
    return grid;
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) return grid;

  const [prodRes, snapRes, queueRes, analysisRes] = await Promise.all([
    supabase.from("products").select("asin,category"),
    supabase.from("keepa_snapshot").select("asin,current_new_yen,current_amazon_yen"),
    supabase
      .from("discovery_queue")
      .select("category,min_price,max_price,status,last_run_at,ingested_count"),
    supabase.from("market_analysis").select("asin,decision"),
  ]);

  if (prodRes.error || snapRes.error) {
    console.warn("[apde] heatmap fetch failed", {
      products: prodRes.error,
      snapshot: snapRes.error,
    });
    return grid;
  }

  const snapMap = new Map<string, SnapshotMini>(
    ((snapRes.data ?? []) as SnapshotMini[]).map((s) => [s.asin, s]),
  );
  const decisionMap = new Map<string, MarketDecision | null>(
    ((analysisRes.data ?? []) as AnalysisRowMini[]).map((r) => [r.asin, r.decision]),
  );

  for (const prod of (prodRes.data ?? []) as ProductRowMini[]) {
    const snap = snapMap.get(prod.asin);
    const price = snap?.current_new_yen ?? snap?.current_amazon_yen ?? null;
    const band = priceToBand(price);
    if (!band) continue;
    const cell = byKey.get(cellKey(prod.category, band.id));
    if (!cell) continue;
    cell.asinCount += 1;
    const d = decisionMap.get(prod.asin);
    if (d === "go") cell.decision.go += 1;
    else if (d === "cond") cell.decision.cond += 1;
    else if (d === "no_go") cell.decision.noGo += 1;
  }

  // queue overlay
  for (const q of (queueRes.data ?? []) as QueueRowMini[]) {
    const bandId = queueBandKey(q.min_price, q.max_price);
    if (!bandId) continue;
    const cell = byKey.get(cellKey(q.category, bandId));
    if (!cell) continue;
    // 同一セルに複数 queue 行があるケースは想定外だが、 後勝ちで上書き
    cell.queueStatus = q.status;
    cell.lastRunAt = q.last_run_at;
    cell.ingestedCount = q.ingested_count;
  }

  return grid;
}

// ─── (c) スループット (直近 24h) ──────────────────────────────────────

export interface ThroughputStats {
  /** market_analysis.computed_at >= NOW - 24h の件数 (新規 + 再評価) */
  ingest24h: number;
  /** api_usage (provider='keepa') の直近 24h コスト合計 */
  keepaTokens24h: number;
  /** discovery_queue.last_run_at >= NOW - 24h の行数 (cron が触ったセル数) */
  dispatchRuns24h: number;
}

export async function getDiscoveryThroughput24h(): Promise<ThroughputStats> {
  const cutoff = new Date(Date.now() - DAY_MS).toISOString();
  const empty: ThroughputStats = { ingest24h: 0, keepaTokens24h: 0, dispatchRuns24h: 0 };

  if (mockMode.supabase) {
    const store = getMockStore();
    const ingest24h = Array.from(store.marketAnalysis.values()).filter(
      (r) => r.computed_at && r.computed_at >= cutoff,
    ).length;
    const keepaTokens24h = store.apiUsage
      .filter((u) => u.provider === "keepa" && u.occurred_at >= cutoff)
      .reduce((s, u) => s + Number(u.cost_estimate ?? 0), 0);
    // mockMode は discovery_queue 別 store なので 0 でよい
    return { ingest24h, keepaTokens24h: Math.round(keepaTokens24h), dispatchRuns24h: 0 };
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) return empty;

  const [ingest, usage, dispatch] = await Promise.all([
    supabase
      .from("market_analysis")
      .select("asin", { count: "exact", head: true })
      .gte("computed_at", cutoff),
    supabase
      .from("api_usage")
      .select("cost_estimate")
      .eq("provider", "keepa")
      .gte("occurred_at", cutoff),
    supabase
      .from("discovery_queue")
      .select("id", { count: "exact", head: true })
      .gte("last_run_at", cutoff),
  ]);

  const keepaTokens = ((usage.data ?? []) as Array<{ cost_estimate: number | null }>)
    .map((r) => Number(r.cost_estimate ?? 0))
    .filter((n) => Number.isFinite(n))
    .reduce((s, n) => s + n, 0);

  return {
    ingest24h: ingest.count ?? 0,
    keepaTokens24h: Math.round(keepaTokens),
    dispatchRuns24h: dispatch.count ?? 0,
  };
}
