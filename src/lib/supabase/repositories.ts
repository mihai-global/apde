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
  DictionaryRow,
  DictionaryType,
  DiscoveryRunRow,
  PurchaseFeedbackRow,
  WatchlistRow,
  WatchlistStatus,
} from "@/lib/types";

// ─── helpers ─────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
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
    .select("asin,title,category,brand,current_price,weight_grams,size_tier,review_count,seller_count,brand_strength,rating");
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
  }));
}

export async function getProductSummary(asin: string): Promise<ProductSummary | null> {
  const list = await listProductSummaries([asin]);
  return list[0] ?? null;
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
