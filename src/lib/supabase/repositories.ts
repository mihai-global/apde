// アプリ全体から使う読み書きインターフェース。
// mockMode.supabase が true のときは in-memory ストア (`mock-store.ts`) を読み書きする。
//
// 設計方針:
// - 関数は冪等で副作用を最小化
// - 戻り値は v1.1 §8 のテーブル定義に揃えた型 (types.ts の *Row)
// - ライブ Supabase ではエラー時に throw、mockMode では throw しない (UI 検証のため)

import { mockMode } from "@/lib/env";
import { getServiceRoleSupabase } from "@/lib/supabase/server";
import { getMockStore, mockUuid } from "@/lib/supabase/mock-store";
import type {
  AnalysisRow,
  AnalysisThreadRow,
  ApiProvider,
  ApiUsageRow,
  AppSettingRow,
  BsrHistoryRow,
  DictionaryRow,
  DictionaryType,
  DiscoveryRunRow,
  KeepaDataRow,
  KeepaSnapshotRow,
  MarketAnalysisRow,
  MarketDecision,
  MonthlySalesSource,
  PriceHistoryRow,
  PriceType,
  PurchaseFeedbackRow,
  SellerHistoryRow,
  Tier,
  WatchlistRow,
  WatchlistStatus,
} from "@/lib/types";
import { deriveTierFromStatus } from "@/lib/types";

// ─── helpers ─────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

// ─── keepa cache ─────────────────────────────────────────────────────────

declare global {
  // mockMode 用の in-memory keepa cache。
  // eslint-disable-next-line no-var
  var __apdeKeepaCache: Map<string, KeepaDataRow> | undefined;
}

function getKeepaMemCache(): Map<string, KeepaDataRow> {
  if (!globalThis.__apdeKeepaCache) globalThis.__apdeKeepaCache = new Map();
  return globalThis.__apdeKeepaCache;
}

const KEEPA_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCachedKeepa(asin: string): Promise<KeepaDataRow | null> {
  const fresh = (row: KeepaDataRow): boolean =>
    Date.parse(row.updated_at) >= Date.now() - KEEPA_TTL_MS;
  if (mockMode.supabase) {
    const row = getKeepaMemCache().get(asin);
    return row && fresh(row) ? row : null;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("keepa_data")
    .select("*")
    .eq("asin", asin)
    .maybeSingle();
  if (error) {
    console.warn("[apde] keepa cache read failed", error);
    return null;
  }
  if (!data) return null;
  const row = data as KeepaDataRow;
  return fresh(row) ? row : null;
}

export async function upsertKeepaCache(row: KeepaDataRow): Promise<void> {
  if (mockMode.supabase) {
    getKeepaMemCache().set(row.asin, row);
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("keepa_data").upsert(row, { onConflict: "asin" });
  if (error) {
    console.warn("[apde] keepa cache write failed", error);
  }
}

// ─── products ─────────────────────────────────────────────────────────

export interface ProductSummary {
  asin: string;
  title: string;
  category: string;
  brand: string;
  current_price: number;
  monthly_sales: number;
  gross_margin_pct: number;
  decision: "GO" | "CONDITIONAL_GO" | "NO_GO";
  score: number;
  size_tier: "SMALL_STANDARD" | "LARGE_STANDARD" | "OVERSIZE";
  weight_grams: number;
  review_count: number;
  seller_count: number;
  brand_strength: number;
  rating: number | null;
  concern: string;
  seed: number;
  /** Keepa imagesCSV 由来の商品画像 URL（未設定時はプレースホルダーへフォールバック） */
  imageUrl?: string;
}

export async function listProductSummaries(asins?: string[]): Promise<ProductSummary[]> {
  if (mockMode.supabase) {
    const products = Array.from(getMockStore().products.values());
    const filter = asins ? products.filter((p) => asins.includes(p.asin)) : products;
    return filter.map((p) => ({
      asin: p.asin,
      title: p.title,
      category: p.category,
      brand: p.brand,
      current_price: p.current_price,
      monthly_sales: p.monthly_sales,
      gross_margin_pct: p.gross_margin_pct,
      decision: p.decision,
      score: p.score,
      size_tier: p.size_tier,
      weight_grams: p.weight_grams,
      review_count: p.review_count,
      seller_count: p.seller_count,
      brand_strength: p.brand_strength,
      rating: p.rating,
      concern: p.concern,
      seed: p.seed_keepa,
      imageUrl: p.image_url ?? undefined,
    }));
  }
  // 本番: products + analysis (latest) を join したビューを期待する
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  let query = supabase
    .from("products")
    .select("asin,title,category,brand,image_url,current_price,weight_grams,size_tier,review_count,seller_count,brand_strength,rating");
  if (asins && asins.length > 0) {
    query = query.in("asin", asins);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((p) => ({
    asin: p.asin,
    title: p.title,
    category: p.category,
    brand: p.brand ?? "",
    current_price: Number(p.current_price ?? 0),
    monthly_sales: 0,
    gross_margin_pct: 0,
    decision: "CONDITIONAL_GO" as const,
    score: 0,
    size_tier: (p.size_tier as ProductSummary["size_tier"] | null) ?? "SMALL_STANDARD",
    weight_grams: Number(p.weight_grams ?? 0),
    review_count: Number(p.review_count ?? 0),
    seller_count: Number(p.seller_count ?? 0),
    brand_strength: Number(p.brand_strength ?? 0),
    rating: p.rating != null ? Number(p.rating) : null,
    concern: "",
    seed: Math.abs(
      [...p.asin].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0),
    ),
    imageUrl: typeof p.image_url === "string" ? p.image_url : undefined,
  }));
}

export async function getProductSummary(asin: string): Promise<ProductSummary | null> {
  const list = await listProductSummaries([asin]);
  return list[0] ?? null;
}

/**
 * 商品マスタの最低限の upsert。Keepa から取得した title/brand/category などをそのまま反映する。
 * mockMode 時は in-memory store の products に書き戻す (詳細フィールドはモック既定値)。
 */
export async function upsertProductMaster(input: {
  asin: string;
  title?: string;
  brand?: string;
  category?: string;
  current_price?: number;
  review_count?: number;
  seller_count?: number;
  image_url?: string | null;
  rating?: number | null;
  weight_grams?: number;
}): Promise<void> {
  if (mockMode.supabase) {
    const store = getMockStore();
    const existing = store.products.get(input.asin);
    const weight = input.weight_grams ?? existing?.weight_grams ?? 0;
    const inferredTier =
      weight > 1000 ? "OVERSIZE" : weight <= 500 ? "SMALL_STANDARD" : "LARGE_STANDARD";
    store.products.set(input.asin, {
      asin: input.asin,
      title: input.title ?? existing?.title ?? input.asin,
      category: input.category ?? existing?.category ?? "未分類",
      brand: input.brand ?? existing?.brand ?? "",
      current_price: input.current_price ?? existing?.current_price ?? 0,
      weight_grams: weight,
      size_tier: input.weight_grams ? inferredTier : existing?.size_tier ?? inferredTier,
      review_count: input.review_count ?? existing?.review_count ?? 0,
      seller_count: input.seller_count ?? existing?.seller_count ?? 0,
      brand_strength: existing?.brand_strength ?? 0,
      rating: input.rating ?? existing?.rating ?? 0,
      is_hazmat: existing?.is_hazmat ?? false,
      is_regulated: existing?.is_regulated ?? false,
      monthly_sales: existing?.monthly_sales ?? 0,
      gross_margin_pct: existing?.gross_margin_pct ?? 0,
      decision: existing?.decision ?? "CONDITIONAL_GO",
      score: existing?.score ?? 0,
      breakdown: existing?.breakdown ?? { price: 0, size: 0, comp: 0, stab: 0, oem: 0 },
      concern: existing?.concern ?? "",
      seed_keepa: existing?.seed_keepa ?? Math.abs([...input.asin].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)),
      image_url: input.image_url ?? existing?.image_url ?? null,
    });
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  // products テーブルは title / category が NOT NULL。新規挿入時のフォールバックを必ず入れる。
  const payload: Record<string, unknown> = {
    asin: input.asin,
    title: input.title ?? input.asin,
    category: input.category ?? "未分類",
  };
  if (input.brand) payload.brand = input.brand;
  if (input.current_price !== undefined) payload.current_price = input.current_price;
  if (input.review_count !== undefined) payload.review_count = input.review_count;
  if (input.seller_count !== undefined) payload.seller_count = input.seller_count;
  if (input.image_url !== undefined) payload.image_url = input.image_url;
  if (input.rating !== undefined && input.rating !== null) payload.rating = input.rating;
  if (input.weight_grams !== undefined && input.weight_grams > 0) {
    payload.weight_grams = input.weight_grams;
    payload.size_tier =
      input.weight_grams > 1000
        ? "OVERSIZE"
        : input.weight_grams <= 500
          ? "SMALL_STANDARD"
          : "LARGE_STANDARD";
  }
  const { error } = await supabase
    .from("products")
    .upsert(payload, { onConflict: "asin" });
  if (error) {
    console.warn("[apde] products upsert failed", error);
  }
}

// ─── watchlist ─────────────────────────────────────────────────────────

export async function listWatchlist(): Promise<WatchlistRow[]> {
  if (mockMode.supabase) {
    return Array.from(getMockStore().watchlist.values()).sort(
      (a, b) => Date.parse(b.added_at) - Date.parse(a.added_at),
    );
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("watchlist")
    .select("asin,status,added_at,user_note,last_change")
    .order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WatchlistRow[];
}

export async function upsertWatchlist(row: {
  asin: string;
  status?: WatchlistStatus;
  user_note?: string | null;
}): Promise<WatchlistRow> {
  const status = row.status ?? "candidate";
  if (mockMode.supabase) {
    const store = getMockStore();
    const existing = store.watchlist.get(row.asin);
    const next: WatchlistRow = {
      asin: row.asin,
      status,
      user_note: row.user_note ?? existing?.user_note ?? null,
      added_at: existing?.added_at ?? nowIso(),
      last_change: existing?.last_change ?? null,
    };
    store.watchlist.set(row.asin, next);
    return next;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) throw new Error("Supabase service role client unavailable");
  const { data, error } = await supabase
    .from("watchlist")
    .upsert({ asin: row.asin, status, user_note: row.user_note ?? null }, { onConflict: "asin" })
    .select()
    .single();
  if (error) throw error;
  return data as WatchlistRow;
}

export async function removeWatchlist(asin: string): Promise<void> {
  if (mockMode.supabase) {
    getMockStore().watchlist.delete(asin);
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("watchlist").delete().eq("asin", asin);
  if (error) throw error;
}

// ─── dictionary ─────────────────────────────────────────────────────────

export async function listDictionary(): Promise<DictionaryRow[]> {
  if (mockMode.supabase) {
    return [...getMockStore().dictionary].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("dictionary")
    .select("id,type,value,note,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DictionaryRow[];
}

export async function addDictionary(row: {
  type: DictionaryType;
  value: string;
  note?: string | null;
}): Promise<DictionaryRow> {
  if (mockMode.supabase) {
    const store = getMockStore();
    const next: DictionaryRow = {
      id: mockUuid(),
      type: row.type,
      value: row.value,
      note: row.note ?? null,
      created_at: nowIso(),
    };
    store.dictionary.unshift(next);
    return next;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) throw new Error("Supabase service role client unavailable");
  const { data, error } = await supabase
    .from("dictionary")
    .insert({ type: row.type, value: row.value, note: row.note ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as DictionaryRow;
}

export async function removeDictionary(id: string): Promise<void> {
  if (mockMode.supabase) {
    const store = getMockStore();
    store.dictionary = store.dictionary.filter((entry) => entry.id !== id);
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("dictionary").delete().eq("id", id);
  if (error) throw error;
}

// ─── discovery_runs ─────────────────────────────────────────────────────────

export async function listDiscoveryRuns(limit = 5): Promise<DiscoveryRunRow[]> {
  if (mockMode.supabase) {
    return [...getMockStore().discoveryRuns]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("discovery_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DiscoveryRunRow[];
}

export async function getDiscoveryRun(id: string): Promise<DiscoveryRunRow | null> {
  if (mockMode.supabase) {
    return getMockStore().discoveryRuns.find((r) => r.id === id) ?? null;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("discovery_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as DiscoveryRunRow | null) ?? null;
}

export async function insertDiscoveryRun(row: Omit<DiscoveryRunRow, "id" | "created_at">): Promise<DiscoveryRunRow> {
  if (mockMode.supabase) {
    const next: DiscoveryRunRow = { id: mockUuid(), created_at: nowIso(), ...row };
    getMockStore().discoveryRuns.unshift(next);
    return next;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) throw new Error("Supabase service role client unavailable");
  const { data, error } = await supabase.from("discovery_runs").insert(row).select().single();
  if (error) throw error;
  return data as DiscoveryRunRow;
}

// ─── dashboard kpis ─────────────────────────────────────────────────────

export interface DashboardKpis {
  goThisMonth: number;
  goLastMonth: number;
  conditionalThisMonth: number;
  watchlistTotal: number;
  watchlistSourcing: number;
  watchlistLive: number;
  feedbackProfitable: number;
  feedbackTotal: number;
  avgDiscoveryDurationSec: number;
  recentRunsCount: number;
  watchlistChangedThisWeek: number;
}

function startOfMonth(offsetMonths = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return d.toISOString();
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const monthStart = startOfMonth(0);
  const lastMonthStart = startOfMonth(-1);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  if (mockMode.supabase) {
    const store = getMockStore();
    const analyses = store.analysis;
    const inMonth = (iso: string) => iso >= monthStart;
    const inLastMonth = (iso: string) => iso >= lastMonthStart && iso < monthStart;
    const goThisMonth = analyses.filter((a) => a.decision === "GO" && inMonth(a.created_at)).length;
    const goLastMonth = analyses.filter((a) => a.decision === "GO" && inLastMonth(a.created_at)).length;
    const conditionalThisMonth = analyses.filter(
      (a) => a.decision === "CONDITIONAL_GO" && inMonth(a.created_at),
    ).length;
    const wl = Array.from(store.watchlist.values());
    const feedback = Array.from(store.feedback.values());
    const runs = store.discoveryRuns;
    return {
      goThisMonth,
      goLastMonth,
      conditionalThisMonth,
      watchlistTotal: wl.length,
      watchlistSourcing: wl.filter((w) => w.status === "sourcing").length,
      watchlistLive: wl.filter((w) => w.status === "live").length,
      feedbackProfitable: feedback.filter((f) => f.outcome === "profitable").length,
      feedbackTotal: feedback.length,
      avgDiscoveryDurationSec:
        runs.length > 0 ? Math.round(runs.reduce((s, r) => s + r.duration_ms, 0) / runs.length / 1000) : 0,
      recentRunsCount: runs.filter((r) => r.created_at >= weekAgo).length,
      watchlistChangedThisWeek: wl.filter((w) => w.added_at >= weekAgo).length,
    };
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) {
    return {
      goThisMonth: 0,
      goLastMonth: 0,
      conditionalThisMonth: 0,
      watchlistTotal: 0,
      watchlistSourcing: 0,
      watchlistLive: 0,
      feedbackProfitable: 0,
      feedbackTotal: 0,
      avgDiscoveryDurationSec: 0,
      recentRunsCount: 0,
      watchlistChangedThisWeek: 0,
    };
  }

  const [goMonth, goLast, condMonth, wlAll, feedbackRows, recentRuns] = await Promise.all([
    supabase
      .from("analysis")
      .select("id", { count: "exact", head: true })
      .eq("decision", "GO")
      .gte("created_at", monthStart),
    supabase
      .from("analysis")
      .select("id", { count: "exact", head: true })
      .eq("decision", "GO")
      .gte("created_at", lastMonthStart)
      .lt("created_at", monthStart),
    supabase
      .from("analysis")
      .select("id", { count: "exact", head: true })
      .eq("decision", "CONDITIONAL_GO")
      .gte("created_at", monthStart),
    supabase.from("watchlist").select("status,added_at"),
    supabase.from("purchase_feedback").select("outcome"),
    supabase.from("discovery_runs").select("duration_ms,created_at").gte("created_at", weekAgo),
  ]);

  const wlList = (wlAll.data ?? []) as Array<{ status: string; added_at: string }>;
  const feedbackList = (feedbackRows.data ?? []) as Array<{ outcome: string }>;
  const runsList = (recentRuns.data ?? []) as Array<{ duration_ms: number; created_at: string }>;

  return {
    goThisMonth: goMonth.count ?? 0,
    goLastMonth: goLast.count ?? 0,
    conditionalThisMonth: condMonth.count ?? 0,
    watchlistTotal: wlList.length,
    watchlistSourcing: wlList.filter((w) => w.status === "sourcing").length,
    watchlistLive: wlList.filter((w) => w.status === "live").length,
    feedbackProfitable: feedbackList.filter((f) => f.outcome === "profitable").length,
    feedbackTotal: feedbackList.length,
    avgDiscoveryDurationSec:
      runsList.length > 0
        ? Math.round(runsList.reduce((s, r) => s + r.duration_ms, 0) / runsList.length / 1000)
        : 0,
    recentRunsCount: runsList.length,
    watchlistChangedThisWeek: wlList.filter((w) => w.added_at >= weekAgo).length,
  };
}

// ─── analysis ─────────────────────────────────────────────────────────

export async function getLatestAnalysis(asin: string): Promise<AnalysisRow | null> {
  if (mockMode.supabase) {
    return (
      getMockStore().analysis
        .filter((a) => a.asin === asin)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null
    );
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("analysis")
    .select("*")
    .eq("asin", asin)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AnalysisRow | null) ?? null;
}

export async function listAnalysisHistory(asin: string, limit = 10): Promise<AnalysisRow[]> {
  if (mockMode.supabase) {
    return getMockStore()
      .analysis.filter((a) => a.asin === asin)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("analysis")
    .select("*")
    .eq("asin", asin)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AnalysisRow[];
}

export async function insertAnalysis(row: Omit<AnalysisRow, "id" | "created_at">): Promise<AnalysisRow> {
  if (mockMode.supabase) {
    const next: AnalysisRow = { id: mockUuid(), created_at: nowIso(), ...row };
    getMockStore().analysis.unshift(next);
    return next;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) throw new Error("Supabase service role client unavailable");
  const { data, error } = await supabase.from("analysis").insert(row).select().single();
  if (error) throw error;
  return data as AnalysisRow;
}

// ─── api_usage ─────────────────────────────────────────────────────────

export async function listApiUsageThisMonth(): Promise<ApiUsageRow[]> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  if (mockMode.supabase) {
    return getMockStore().apiUsage.filter(
      (u) => Date.parse(u.occurred_at) >= start.getTime(),
    );
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("api_usage")
    .select("*")
    .gte("occurred_at", start.toISOString())
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ApiUsageRow[];
}

export async function recordApiUsage(row: {
  provider: ApiProvider;
  endpoint: string;
  cost_estimate: number;
}): Promise<void> {
  const occurredAt = nowIso();
  if (mockMode.supabase) {
    getMockStore().apiUsage.unshift({ id: mockUuid(), occurred_at: occurredAt, ...row });
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("api_usage").insert({ ...row, occurred_at: occurredAt });
  if (error) throw error;
}

// ─── app_settings ─────────────────────────────────────────────────────────

export async function getAppSetting<T = unknown>(key: string): Promise<T | null> {
  if (mockMode.supabase) {
    const row = getMockStore().appSettings.get(key);
    return (row?.value as T) ?? null;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return ((data?.value as T | undefined) ?? null) as T | null;
}

export async function setAppSetting(key: string, value: unknown): Promise<AppSettingRow> {
  if (mockMode.supabase) {
    const next: AppSettingRow = { key, value, updated_at: nowIso() };
    getMockStore().appSettings.set(key, next);
    return next;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) throw new Error("Supabase service role client unavailable");
  const { data, error } = await supabase
    .from("app_settings")
    .upsert({ key, value }, { onConflict: "key" })
    .select()
    .single();
  if (error) throw error;
  return data as AppSettingRow;
}

// ─── analysis_threads (LLM Q&A) ─────────────────────────────────────────────

export async function listThreads(asin: string): Promise<AnalysisThreadRow[]> {
  if (mockMode.supabase) {
    return getMockStore()
      .threads.filter((t) => t.asin === asin)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("analysis_threads")
    .select("*")
    .eq("asin", asin)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AnalysisThreadRow[];
}

export async function appendThread(row: { asin: string; prompt: string; response: string }): Promise<AnalysisThreadRow> {
  if (mockMode.supabase) {
    const next: AnalysisThreadRow = { id: mockUuid(), created_at: nowIso(), ...row };
    getMockStore().threads.push(next);
    return next;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) throw new Error("Supabase service role client unavailable");
  const { data, error } = await supabase.from("analysis_threads").insert(row).select().single();
  if (error) throw error;
  return data as AnalysisThreadRow;
}

// ─── purchase_feedback ─────────────────────────────────────────────────────

export async function getFeedback(asin: string): Promise<PurchaseFeedbackRow | null> {
  if (mockMode.supabase) {
    return getMockStore().feedback.get(asin) ?? null;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("purchase_feedback")
    .select("*")
    .eq("asin", asin)
    .maybeSingle();
  if (error) throw error;
  return (data as PurchaseFeedbackRow | null) ?? null;
}

export async function upsertFeedback(row: PurchaseFeedbackRow): Promise<void> {
  if (mockMode.supabase) {
    getMockStore().feedback.set(row.asin, row);
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) throw new Error("Supabase service role client unavailable");
  const { error } = await supabase.from("purchase_feedback").upsert(row, { onConflict: "asin" });
  if (error) throw error;
}

// ─── R1: keepa_snapshot ────────────────────────────────────────────────

export async function upsertKeepaSnapshot(row: KeepaSnapshotRow): Promise<void> {
  if (mockMode.supabase) {
    getMockStore().keepaSnapshot.set(row.asin, row);
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("keepa_snapshot").upsert(row, { onConflict: "asin" });
  if (error) {
    console.warn("[apde] keepa_snapshot upsert failed", error);
  }
}

export async function getKeepaSnapshot(asin: string): Promise<KeepaSnapshotRow | null> {
  if (mockMode.supabase) {
    return getMockStore().keepaSnapshot.get(asin) ?? null;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("keepa_snapshot")
    .select("*")
    .eq("asin", asin)
    .maybeSingle();
  if (error) {
    console.warn("[apde] keepa_snapshot read failed", error);
    return null;
  }
  return (data as KeepaSnapshotRow | null) ?? null;
}

// ─── R1: market_analysis ──────────────────────────────────────────────

export async function upsertMarketAnalysis(row: MarketAnalysisRow): Promise<void> {
  if (mockMode.supabase) {
    getMockStore().marketAnalysis.set(row.asin, row);
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("market_analysis").upsert(row, { onConflict: "asin" });
  if (error) {
    console.warn("[apde] market_analysis upsert failed", error);
  }
}

export async function getMarketAnalysis(asin: string): Promise<MarketAnalysisRow | null> {
  if (mockMode.supabase) {
    return getMockStore().marketAnalysis.get(asin) ?? null;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("market_analysis")
    .select("*")
    .eq("asin", asin)
    .maybeSingle();
  if (error) {
    console.warn("[apde] market_analysis read failed", error);
    return null;
  }
  return (data as MarketAnalysisRow | null) ?? null;
}

export interface MarketAnalysisFilter {
  minScore?: number;          // market_score >=
  minPrice?: number;          // current_new_yen >=
  maxPrice?: number;          // current_new_yen <=
  maxReviews?: number;        // count_reviews <=
  category?: string;          // products.category 一致 (将来 category_tree @> JSON にする)
  decision?: MarketDecision;
  limit?: number;
}

/** market_score 降順で candidate を返す。 R2 (DB-only Search) の主クエリ。 */
export async function listMarketAnalysis(
  filter: MarketAnalysisFilter = {},
): Promise<Array<MarketAnalysisRow & { snapshot: KeepaSnapshotRow | null; product: { title: string; category: string; brand: string | null; image_url: string | null } | null }>> {
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);

  if (mockMode.supabase) {
    const store = getMockStore();
    const rows = Array.from(store.marketAnalysis.values()).filter((r) => {
      if (filter.minScore !== undefined && (r.market_score ?? 0) < filter.minScore) return false;
      if (filter.decision && r.decision !== filter.decision) return false;
      const snap = store.keepaSnapshot.get(r.asin);
      const price = snap?.current_new_yen ?? snap?.current_amazon_yen ?? null;
      if (filter.minPrice !== undefined && (price ?? Infinity) < filter.minPrice) return false;
      if (filter.maxPrice !== undefined && (price ?? -Infinity) > filter.maxPrice) return false;
      if (filter.maxReviews !== undefined && (snap?.count_reviews ?? 0) > filter.maxReviews) return false;
      if (filter.category) {
        const prod = store.products.get(r.asin);
        if (prod && prod.category && filter.category && !prod.category.includes(filter.category)) return false;
      }
      return true;
    });
    rows.sort((a, b) => (b.market_score ?? 0) - (a.market_score ?? 0));
    return rows.slice(0, limit).map((r) => {
      const prod = store.products.get(r.asin);
      return {
        ...r,
        snapshot: store.keepaSnapshot.get(r.asin) ?? null,
        product: prod
          ? {
              title: prod.title,
              category: prod.category,
              brand: prod.brand,
              image_url: prod.image_url ?? null,
            }
          : null,
      };
    });
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  // 1) market_analysis をスコア順にスライス
  let q = supabase.from("market_analysis").select("*").order("market_score", { ascending: false });
  if (filter.minScore !== undefined) q = q.gte("market_score", filter.minScore);
  if (filter.decision) q = q.eq("decision", filter.decision);
  q = q.limit(limit);
  const { data: maRows, error } = await q;
  if (error) {
    console.warn("[apde] listMarketAnalysis failed", error);
    return [];
  }
  const list = (maRows ?? []) as MarketAnalysisRow[];
  if (list.length === 0) return [];

  // 2) snapshot + product を batched fetch
  const asins = list.map((r) => r.asin);
  const [{ data: snaps }, { data: prods }] = await Promise.all([
    supabase.from("keepa_snapshot").select("*").in("asin", asins),
    supabase.from("products").select("asin,title,category,brand,image_url,current_price").in("asin", asins),
  ]);
  const snapMap = new Map<string, KeepaSnapshotRow>(
    ((snaps ?? []) as KeepaSnapshotRow[]).map((s) => [s.asin, s]),
  );
  type ProdMini = { asin: string; title: string; category: string; brand: string | null; image_url: string | null; current_price: number | null };
  const prodMap = new Map<string, ProdMini>(((prods ?? []) as ProdMini[]).map((p) => [p.asin, p]));

  // 3) snapshot/product 側のフィルタを後段で適用
  return list
    .filter((r) => {
      const s = snapMap.get(r.asin) ?? null;
      const price = s?.current_new_yen ?? s?.current_amazon_yen ?? null;
      if (filter.minPrice !== undefined && (price ?? Infinity) < filter.minPrice) return false;
      if (filter.maxPrice !== undefined && (price ?? -Infinity) > filter.maxPrice) return false;
      if (filter.maxReviews !== undefined && (s?.count_reviews ?? 0) > filter.maxReviews) return false;
      if (filter.category) {
        const p = prodMap.get(r.asin);
        if (p && p.category && !p.category.includes(filter.category)) return false;
      }
      return true;
    })
    .map((r) => ({
      ...r,
      snapshot: snapMap.get(r.asin) ?? null,
      product: (() => {
        const p = prodMap.get(r.asin);
        return p
          ? { title: p.title, category: p.category, brand: p.brand, image_url: p.image_url }
          : null;
      })(),
    }));
}

// ─── R1: history テーブル群 (時系列) ──────────────────────────────────

export async function insertPriceHistory(rows: PriceHistoryRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (mockMode.supabase) {
    const store = getMockStore();
    const seen = new Set(store.priceHistory.map((r) => `${r.asin}|${r.price_type}|${r.ts}`));
    for (const r of rows) {
      const key = `${r.asin}|${r.price_type}|${r.ts}`;
      if (seen.has(key)) continue;
      store.priceHistory.push(r);
      seen.add(key);
    }
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  // ON CONFLICT DO NOTHING 相当: ignoreDuplicates: true
  const { error } = await supabase
    .from("price_history")
    .upsert(rows, { onConflict: "asin,price_type,ts", ignoreDuplicates: true });
  if (error) {
    console.warn("[apde] price_history insert failed", error);
  }
}

export async function insertBsrHistory(rows: BsrHistoryRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (mockMode.supabase) {
    const store = getMockStore();
    const seen = new Set(store.bsrHistory.map((r) => `${r.asin}|${r.ts}`));
    for (const r of rows) {
      const key = `${r.asin}|${r.ts}`;
      if (seen.has(key)) continue;
      store.bsrHistory.push(r);
      seen.add(key);
    }
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from("bsr_history")
    .upsert(rows, { onConflict: "asin,ts", ignoreDuplicates: true });
  if (error) {
    console.warn("[apde] bsr_history insert failed", error);
  }
}

export async function insertSellerHistory(rows: SellerHistoryRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (mockMode.supabase) {
    const store = getMockStore();
    const seen = new Set(store.sellerHistory.map((r) => `${r.asin}|${r.ts}`));
    for (const r of rows) {
      const key = `${r.asin}|${r.ts}`;
      if (seen.has(key)) continue;
      store.sellerHistory.push(r);
      seen.add(key);
    }
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from("seller_history")
    .upsert(rows, { onConflict: "asin,ts", ignoreDuplicates: true });
  if (error) {
    console.warn("[apde] seller_history insert failed", error);
  }
}

// ─── R1: products refresh タイムスタンプ + Tier ───────────────────────

/**
 * products.keepa_last_diff_at / keepa_last_full_at / tier を更新する。
 * Tier は watchlist.status から自動派生 (deriveTierFromStatus)。
 * 渡された値がない列は更新しない。
 */
export async function updateProductRefreshMeta(input: {
  asin: string;
  diffAt?: string | null;       // ISO timestamp (history=0 取得時)
  fullAt?: string | null;       // ISO timestamp (history=1 取得時)
  tier?: Tier;                  // 明示指定 (省略時は触らない)
}): Promise<void> {
  if (mockMode.supabase) {
    const store = getMockStore();
    const existing = store.productMeta.get(input.asin) ?? {
      keepa_last_full_at: null,
      keepa_last_diff_at: null,
      tier: 3 as Tier,
    };
    if (input.diffAt !== undefined) existing.keepa_last_diff_at = input.diffAt;
    if (input.fullAt !== undefined) existing.keepa_last_full_at = input.fullAt;
    if (input.tier !== undefined) existing.tier = input.tier;
    store.productMeta.set(input.asin, existing);
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const patch: Record<string, unknown> = {};
  if (input.diffAt !== undefined) patch.keepa_last_diff_at = input.diffAt;
  if (input.fullAt !== undefined) patch.keepa_last_full_at = input.fullAt;
  if (input.tier !== undefined) patch.tier = input.tier;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("products").update(patch).eq("asin", input.asin);
  if (error) {
    console.warn("[apde] update products refresh meta failed", error);
  }
}

/** watchlist.status から Tier を派生し、 products.tier に反映する。 R1 で使用。 */
export async function syncTierFromWatchlist(asin: string): Promise<Tier> {
  let status: WatchlistStatus | null = null;
  if (mockMode.supabase) {
    const wl = getMockStore().watchlist.get(asin);
    status = wl?.status ?? null;
  } else {
    const supabase = getServiceRoleSupabase();
    if (supabase) {
      const { data } = await supabase
        .from("watchlist")
        .select("status")
        .eq("asin", asin)
        .maybeSingle();
      status = ((data as { status?: WatchlistStatus } | null)?.status) ?? null;
    }
  }
  const tier = deriveTierFromStatus(status);
  await updateProductRefreshMeta({ asin, tier });
  return tier;
}

// ─── R5: history readers (詳細ページ用) ─────────────────────────────

export async function listPriceHistory(
  asin: string,
  priceType: PriceType = "new",
  limit = 200,
): Promise<PriceHistoryRow[]> {
  if (mockMode.supabase) {
    return getMockStore()
      .priceHistory.filter((r) => r.asin === asin && r.price_type === priceType)
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .slice(-limit);
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("price_history")
    .select("*")
    .eq("asin", asin)
    .eq("price_type", priceType)
    .order("ts", { ascending: true })
    .limit(limit);
  if (error) {
    console.warn("[apde] listPriceHistory failed", error);
    return [];
  }
  return (data ?? []) as PriceHistoryRow[];
}

export async function listBsrHistory(asin: string, limit = 200): Promise<BsrHistoryRow[]> {
  if (mockMode.supabase) {
    return getMockStore()
      .bsrHistory.filter((r) => r.asin === asin)
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .slice(-limit);
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("bsr_history")
    .select("*")
    .eq("asin", asin)
    .order("ts", { ascending: true })
    .limit(limit);
  if (error) {
    console.warn("[apde] listBsrHistory failed", error);
    return [];
  }
  return (data ?? []) as BsrHistoryRow[];
}

export async function listSellerHistory(asin: string, limit = 200): Promise<SellerHistoryRow[]> {
  if (mockMode.supabase) {
    return getMockStore()
      .sellerHistory.filter((r) => r.asin === asin)
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .slice(-limit);
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("seller_history")
    .select("*")
    .eq("asin", asin)
    .order("ts", { ascending: true })
    .limit(limit);
  if (error) {
    console.warn("[apde] listSellerHistory failed", error);
    return [];
  }
  return (data ?? []) as SellerHistoryRow[];
}

/** 詳細ページで products テーブルの refresh タイムスタンプ + tier を読む */
export async function getProductRefreshMeta(asin: string): Promise<{
  tier: Tier;
  keepa_last_full_at: string | null;
  keepa_last_diff_at: string | null;
} | null> {
  if (mockMode.supabase) {
    const meta = getMockStore().productMeta.get(asin);
    if (!meta) return null;
    return {
      tier: meta.tier as Tier,
      keepa_last_full_at: meta.keepa_last_full_at,
      keepa_last_diff_at: meta.keepa_last_diff_at,
    };
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("products")
    .select("tier,keepa_last_full_at,keepa_last_diff_at")
    .eq("asin", asin)
    .maybeSingle();
  if (error) {
    console.warn("[apde] getProductRefreshMeta failed", error);
    return null;
  }
  if (!data) return null;
  const row = data as { tier?: number; keepa_last_full_at: string | null; keepa_last_diff_at: string | null };
  const tier = (row.tier === 1 || row.tier === 2 ? row.tier : 3) as Tier;
  return {
    tier,
    keepa_last_full_at: row.keepa_last_full_at,
    keepa_last_diff_at: row.keepa_last_diff_at,
  };
}

// ─── R5: diagnostics 用集計 ──────────────────────────────────────────

export interface RefreshQueueCounts {
  /** Tier 別の総 ASIN 数 */
  tier1Total: number;
  tier2Total: number;
  tier3Total: number;
  /** 24h 経過 (Tier 1) と 7d 経過 (Tier 2) の queue 件数 */
  tier1Pending: number;
  tier2Pending: number;
}

export async function getRefreshQueueCounts(): Promise<RefreshQueueCounts> {
  const now = Date.now();
  const tier1Cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const tier2Cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  if (mockMode.supabase) {
    const store = getMockStore();
    let t1 = 0, t2 = 0, t3 = 0, p1 = 0, p2 = 0;
    for (const meta of store.productMeta.values()) {
      const lastDiff = meta.keepa_last_diff_at;
      if (meta.tier === 1) {
        t1 += 1;
        if (lastDiff === null || lastDiff < tier1Cutoff) p1 += 1;
      } else if (meta.tier === 2) {
        t2 += 1;
        if (lastDiff === null || lastDiff < tier2Cutoff) p2 += 1;
      } else {
        t3 += 1;
      }
    }
    return { tier1Total: t1, tier2Total: t2, tier3Total: t3, tier1Pending: p1, tier2Pending: p2 };
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) {
    return { tier1Total: 0, tier2Total: 0, tier3Total: 0, tier1Pending: 0, tier2Pending: 0 };
  }
  // 5 つの head-only count を 1 round で
  const [t1, t2, t3, p1, p2] = await Promise.all([
    supabase.from("products").select("asin", { count: "exact", head: true }).eq("tier", 1),
    supabase.from("products").select("asin", { count: "exact", head: true }).eq("tier", 2),
    supabase.from("products").select("asin", { count: "exact", head: true }).eq("tier", 3),
    supabase
      .from("products")
      .select("asin", { count: "exact", head: true })
      .eq("tier", 1)
      .or(`keepa_last_diff_at.is.null,keepa_last_diff_at.lt.${tier1Cutoff}`),
    supabase
      .from("products")
      .select("asin", { count: "exact", head: true })
      .eq("tier", 2)
      .or(`keepa_last_diff_at.is.null,keepa_last_diff_at.lt.${tier2Cutoff}`),
  ]);
  return {
    tier1Total: t1.count ?? 0,
    tier2Total: t2.count ?? 0,
    tier3Total: t3.count ?? 0,
    tier1Pending: p1.count ?? 0,
    tier2Pending: p2.count ?? 0,
  };
}

export interface StorageCounts {
  products: number;
  keepaSnapshot: number;
  marketAnalysis: number;
  priceHistory: number;
  bsrHistory: number;
  sellerHistory: number;
}

export async function getStorageCounts(): Promise<StorageCounts> {
  if (mockMode.supabase) {
    const store = getMockStore();
    return {
      products: store.products.size,
      keepaSnapshot: store.keepaSnapshot.size,
      marketAnalysis: store.marketAnalysis.size,
      priceHistory: store.priceHistory.length,
      bsrHistory: store.bsrHistory.length,
      sellerHistory: store.sellerHistory.length,
    };
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) {
    return {
      products: 0,
      keepaSnapshot: 0,
      marketAnalysis: 0,
      priceHistory: 0,
      bsrHistory: 0,
      sellerHistory: 0,
    };
  }
  const [p, ks, ma, ph, bh, sh] = await Promise.all([
    supabase.from("products").select("asin", { count: "exact", head: true }),
    supabase.from("keepa_snapshot").select("asin", { count: "exact", head: true }),
    supabase.from("market_analysis").select("asin", { count: "exact", head: true }),
    supabase.from("price_history").select("asin", { count: "exact", head: true }),
    supabase.from("bsr_history").select("asin", { count: "exact", head: true }),
    supabase.from("seller_history").select("asin", { count: "exact", head: true }),
  ]);
  return {
    products: p.count ?? 0,
    keepaSnapshot: ks.count ?? 0,
    marketAnalysis: ma.count ?? 0,
    priceHistory: ph.count ?? 0,
    bsrHistory: bh.count ?? 0,
    sellerHistory: sh.count ?? 0,
  };
}

/**
 * R4: Cron が tier 別に refresh 対象 ASIN を取り出すためのヘルパー。
 *   - tier 1 (sourcing/live): 24h 経過したものを優先
 *   - tier 2 (candidate)    : 7d 経過したものを優先
 *   - tier 3                : このルートでは扱わない (オンデマンドのみ)
 *
 * 戻り値は keepa_last_diff_at の昇順 (古いものから先)。 NULL は最古扱い。
 */
export async function listProductsForRefresh(input: {
  tier: Tier;
  olderThan: string; // ISO timestamp。 keepa_last_diff_at < olderThan を対象
  limit?: number;
}): Promise<string[]> {
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);

  if (mockMode.supabase) {
    const store = getMockStore();
    const list: Array<{ asin: string; ts: string }> = [];
    for (const [asin, meta] of store.productMeta.entries()) {
      if (meta.tier !== input.tier) continue;
      const lastDiff = meta.keepa_last_diff_at;
      // null は最古扱い: 最初に処理させる
      if (lastDiff === null || lastDiff < input.olderThan) {
        list.push({ asin, ts: lastDiff ?? "1970-01-01T00:00:00Z" });
      }
    }
    list.sort((a, b) => a.ts.localeCompare(b.ts));
    return list.slice(0, limit).map((x) => x.asin);
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  // keepa_last_diff_at < olderThan OR is null  を or.() で表現
  const { data, error } = await supabase
    .from("products")
    .select("asin,keepa_last_diff_at")
    .eq("tier", input.tier)
    .or(`keepa_last_diff_at.is.null,keepa_last_diff_at.lt.${input.olderThan}`)
    .order("keepa_last_diff_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    console.warn("[apde] listProductsForRefresh failed", error);
    return [];
  }
  return ((data ?? []) as Array<{ asin: string }>).map((p) => p.asin);
}

// re-export types used by ingest layer for convenience
export type { MonthlySalesSource, PriceType };

