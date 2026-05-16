// discovery_queue リポジトリ
//
// Cron dispatcher (`/api/cron/dispatch`) が ingestDiscover を循環実行するための
// シンプルなキュー。 1 cron run = 1 ジョブ pop で十分なので、
// 排他ロックは「conditional UPDATE で status を flip できなければ別 worker に取られた」
// と判定するパターン (GH Actions の concurrency group 併用でほぼ衝突しない)。
//
// 主な責務:
//   - enqueueDiscoveryJobs(): seed 投入 (重複は no-op)
//   - pickNextDiscoveryJob(): pending → running、なければ 24h 経過 done → running
//   - markDiscoveryJobDone(): done に flip、 ingested_count を記録
//   - markDiscoveryJobFailed(): pending に戻す (attempts >= 5 で failed)
//   - listDiscoveryQueue(): UI 用一覧
//   - getDiscoveryQueueCounts(): /diagnostics 用 status 別件数

import { mockMode } from "@/lib/env";
import { getServiceRoleSupabase } from "@/lib/supabase/server";
import type { DiscoveryQueueRow, DiscoveryQueueStatus } from "@/lib/types";

const TABLE = "discovery_queue";
const MAX_ATTEMPTS = 5;
/** done 後にもう一度回すまでのクールダウン (1 ジョブが 14 カテゴリ循環するように) */
const DONE_RECYCLE_HOURS = 24;

// ─── mock store (Supabase 未設定時のローカル開発用) ───────────────────
declare global {
  // eslint-disable-next-line no-var
  var __apdeDiscoveryQueue: { rows: DiscoveryQueueRow[]; nextId: number } | undefined;
}

function getMockQueue(): { rows: DiscoveryQueueRow[]; nextId: number } {
  if (!globalThis.__apdeDiscoveryQueue) {
    globalThis.__apdeDiscoveryQueue = { rows: [], nextId: 1 };
  }
  return globalThis.__apdeDiscoveryQueue;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── 型 ───────────────────────────────────────────────────────────────

export interface DiscoveryQueueInput {
  category: string;
  keyword?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minReviews?: number | null;
  maxReviews?: number | null;
  perPage?: number;
  enrich?: boolean;
  priority?: number;
}

export interface DiscoveryQueueCounts {
  pending: number;
  running: number;
  done: number;
  failed: number;
  total: number;
}

// ─── enqueue ─────────────────────────────────────────────────────────

/**
 * Bulk insert。 (category, keyword, min_price, max_price) が完全一致するエントリは
 * スキップ (重複投入による無限増殖を防ぐ)。
 * 戻り値: 実際に追加された件数。
 */
export async function enqueueDiscoveryJobs(jobs: DiscoveryQueueInput[]): Promise<number> {
  if (jobs.length === 0) return 0;

  if (mockMode.supabase) {
    const q = getMockQueue();
    let added = 0;
    for (const j of jobs) {
      const exists = q.rows.some(
        (r) =>
          r.category === j.category &&
          (r.keyword ?? null) === (j.keyword ?? null) &&
          (r.min_price ?? null) === (j.minPrice ?? null) &&
          (r.max_price ?? null) === (j.maxPrice ?? null),
      );
      if (exists) continue;
      q.rows.push({
        id: q.nextId++,
        category: j.category,
        keyword: j.keyword ?? null,
        min_price: j.minPrice ?? null,
        max_price: j.maxPrice ?? null,
        min_reviews: j.minReviews ?? null,
        max_reviews: j.maxReviews ?? null,
        per_page: j.perPage ?? 50,
        enrich: j.enrich ?? false,
        priority: j.priority ?? 50,
        status: "pending",
        attempts: 0,
        last_error: null,
        last_run_at: null,
        ingested_count: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      added += 1;
    }
    return added;
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) throw new Error("Supabase service role client unavailable");

  // 既存と重複しないものだけ insert。 Postgres 側で対応するユニーク制約は張っていない
  // (seed は最大 56 件、運用中の動的追加もユーザー操作のみなので競合は事実上ない)。
  // .is(col, null) は IS NULL、 .eq(col, val) は = val なので null/非 null で使い分ける。
  let added = 0;
  for (const j of jobs) {
    const keyword = j.keyword ?? null;
    const minPrice = j.minPrice ?? null;
    const maxPrice = j.maxPrice ?? null;
    let query = supabase.from(TABLE).select("id").eq("category", j.category).limit(1);
    query = keyword === null ? query.is("keyword", null) : query.eq("keyword", keyword);
    query = minPrice === null ? query.is("min_price", null) : query.eq("min_price", minPrice);
    query = maxPrice === null ? query.is("max_price", null) : query.eq("max_price", maxPrice);
    const existing = await query;
    if (existing.data && existing.data.length > 0) continue;

    const { error } = await supabase.from(TABLE).insert({
      category: j.category,
      keyword: j.keyword ?? null,
      min_price: j.minPrice ?? null,
      max_price: j.maxPrice ?? null,
      min_reviews: j.minReviews ?? null,
      max_reviews: j.maxReviews ?? null,
      per_page: j.perPage ?? 50,
      enrich: j.enrich ?? false,
      priority: j.priority ?? 50,
    });
    if (error) {
      console.warn("[apde] enqueueDiscoveryJobs insert failed", { job: j, error });
      continue;
    }
    added += 1;
  }
  return added;
}

// ─── pickNext ────────────────────────────────────────────────────────

/**
 * 1 ジョブだけ pop して `status='running'` に flip する。
 * 優先順位:
 *   1. status='pending' (priority desc, last_run_at NULLS first)
 *   2. status='done' AND last_run_at < NOW() - 24h (循環)
 * 対象がなければ null。
 *
 * Race condition 対策: SELECT で候補 id を 1 件取り、 UPDATE で `id=? AND status=候補のstatus`
 * の条件で書き換える。 衝突したら 0 行更新となるので呼び出し側で null 扱いする。
 */
export async function pickNextDiscoveryJob(): Promise<DiscoveryQueueRow | null> {
  const cutoff = new Date(Date.now() - DONE_RECYCLE_HOURS * 60 * 60 * 1000).toISOString();

  if (mockMode.supabase) {
    const q = getMockQueue();
    // 1) pending
    let candidate = q.rows
      .filter((r) => r.status === "pending" && r.attempts < MAX_ATTEMPTS)
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (a.last_run_at ?? "").localeCompare(b.last_run_at ?? "");
      })[0];
    // 2) done を再利用
    if (!candidate) {
      candidate = q.rows
        .filter(
          (r) =>
            r.status === "done" &&
            r.attempts < MAX_ATTEMPTS &&
            (r.last_run_at === null || r.last_run_at < cutoff),
        )
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return (a.last_run_at ?? "").localeCompare(b.last_run_at ?? "");
        })[0];
    }
    if (!candidate) return null;
    candidate.status = "running";
    candidate.attempts += 1;
    candidate.last_run_at = nowIso();
    candidate.updated_at = nowIso();
    return { ...candidate };
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) return null;

  // pending を優先、 なければ 24h 経過 done
  const findOne = async (status: DiscoveryQueueStatus): Promise<DiscoveryQueueRow | null> => {
    let q = supabase
      .from(TABLE)
      .select("*")
      .eq("status", status)
      .lt("attempts", MAX_ATTEMPTS)
      .order("priority", { ascending: false })
      .order("last_run_at", { ascending: true, nullsFirst: true })
      .limit(1);
    if (status === "done") q = q.lt("last_run_at", cutoff);
    const { data, error } = await q;
    if (error) {
      console.warn("[apde] pickNextDiscoveryJob select failed", { status, error });
      return null;
    }
    return (data?.[0] as DiscoveryQueueRow | undefined) ?? null;
  };

  let candidate = await findOne("pending");
  if (!candidate) candidate = await findOne("done");
  if (!candidate) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "running",
      attempts: candidate.attempts + 1,
      last_run_at: nowIso(),
    })
    .eq("id", candidate.id)
    .eq("status", candidate.status) // 別 worker に取られていないことを確認
    .select()
    .maybeSingle();

  if (error) {
    console.warn("[apde] pickNextDiscoveryJob update failed", { id: candidate.id, error });
    return null;
  }
  return (data as DiscoveryQueueRow | null) ?? null;
}

// ─── peek (status flip なし、 UI 用) ────────────────────────────────────

/**
 * `pickNextDiscoveryJob` と同じ優先順位で N 件先読み。 status は flip しない。
 * `/discovery` の「次に取得予定 Top 5」用。
 *
 * 並び順:
 *  1. status='pending' で priority desc → last_run_at nulls first
 *  2. status='done' AND last_run_at < NOW() - 24h (循環) を 1. の続きで
 * 上限 limit 件、 attempts >= MAX_ATTEMPTS は除外。
 */
export async function peekNextDiscoveryJobs(limit = 5): Promise<DiscoveryQueueRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const cutoff = new Date(Date.now() - DONE_RECYCLE_HOURS * 60 * 60 * 1000).toISOString();

  const sortByPriority = (a: DiscoveryQueueRow, b: DiscoveryQueueRow): number => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.last_run_at ?? "").localeCompare(b.last_run_at ?? "");
  };

  if (mockMode.supabase) {
    const q = getMockQueue();
    const pending = q.rows
      .filter((r) => r.status === "pending" && r.attempts < MAX_ATTEMPTS)
      .sort(sortByPriority);
    const dueDone = q.rows
      .filter(
        (r) =>
          r.status === "done" &&
          r.attempts < MAX_ATTEMPTS &&
          (r.last_run_at === null || r.last_run_at < cutoff),
      )
      .sort(sortByPriority);
    return [...pending, ...dueDone].slice(0, safeLimit).map((r) => ({ ...r }));
  }

  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];

  const fetchByStatus = async (
    status: DiscoveryQueueStatus,
  ): Promise<DiscoveryQueueRow[]> => {
    let q = supabase
      .from(TABLE)
      .select("*")
      .eq("status", status)
      .lt("attempts", MAX_ATTEMPTS)
      .order("priority", { ascending: false })
      .order("last_run_at", { ascending: true, nullsFirst: true })
      .limit(safeLimit);
    if (status === "done") q = q.lt("last_run_at", cutoff);
    const { data, error } = await q;
    if (error) {
      console.warn("[apde] peekNextDiscoveryJobs select failed", { status, error });
      return [];
    }
    return (data ?? []) as DiscoveryQueueRow[];
  };

  const pending = await fetchByStatus("pending");
  if (pending.length >= safeLimit) return pending.slice(0, safeLimit);
  const dueDone = await fetchByStatus("done");
  return [...pending, ...dueDone].slice(0, safeLimit);
}

// ─── done ────────────────────────────────────────────────────────────

export async function markDiscoveryJobDone(id: number, ingestedCount: number): Promise<void> {
  if (mockMode.supabase) {
    const q = getMockQueue();
    const row = q.rows.find((r) => r.id === id);
    if (!row) return;
    row.status = "done";
    row.ingested_count = ingestedCount;
    row.last_error = null;
    row.updated_at = nowIso();
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from(TABLE)
    .update({ status: "done", ingested_count: ingestedCount, last_error: null })
    .eq("id", id);
  if (error) console.warn("[apde] markDiscoveryJobDone failed", { id, error });
}

// ─── failed ──────────────────────────────────────────────────────────

/**
 * 失敗時: attempts はすでに pickNext で +1 されているので、ここでは status だけ更新。
 *   - attempts < MAX_ATTEMPTS → 'pending' に戻して再試行可能に
 *   - 上限到達 → 'failed' 確定
 */
export async function markDiscoveryJobFailed(id: number, message: string): Promise<void> {
  const truncated = message.slice(0, 500);
  if (mockMode.supabase) {
    const q = getMockQueue();
    const row = q.rows.find((r) => r.id === id);
    if (!row) return;
    row.status = row.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    row.last_error = truncated;
    row.updated_at = nowIso();
    return;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return;

  const { data: current } = await supabase
    .from(TABLE)
    .select("attempts")
    .eq("id", id)
    .maybeSingle();
  const attempts = (current?.attempts as number | undefined) ?? MAX_ATTEMPTS;
  const nextStatus: DiscoveryQueueStatus = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
  const { error } = await supabase
    .from(TABLE)
    .update({ status: nextStatus, last_error: truncated })
    .eq("id", id);
  if (error) console.warn("[apde] markDiscoveryJobFailed failed", { id, error });
}

// ─── list / counts ───────────────────────────────────────────────────

export async function listDiscoveryQueue(limit = 100): Promise<DiscoveryQueueRow[]> {
  if (mockMode.supabase) {
    return [...getMockQueue().rows]
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return Date.parse(b.updated_at) - Date.parse(a.updated_at);
      })
      .slice(0, limit);
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[apde] listDiscoveryQueue failed", error);
    return [];
  }
  return (data ?? []) as DiscoveryQueueRow[];
}

export async function getDiscoveryQueueCounts(): Promise<DiscoveryQueueCounts> {
  const empty: DiscoveryQueueCounts = { pending: 0, running: 0, done: 0, failed: 0, total: 0 };

  if (mockMode.supabase) {
    const counts = { ...empty };
    for (const r of getMockQueue().rows) {
      counts[r.status] += 1;
      counts.total += 1;
    }
    return counts;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return empty;
  const { data, error } = await supabase.from(TABLE).select("status");
  if (error) {
    console.warn("[apde] getDiscoveryQueueCounts failed", error);
    return empty;
  }
  const counts = { ...empty };
  for (const r of (data ?? []) as { status: DiscoveryQueueStatus }[]) {
    counts[r.status] += 1;
    counts.total += 1;
  }
  return counts;
}

// ─── danger: clear (admin only) ──────────────────────────────────────

export async function clearDiscoveryQueue(): Promise<number> {
  if (mockMode.supabase) {
    const q = getMockQueue();
    const n = q.rows.length;
    q.rows.length = 0;
    q.nextId = 1;
    return n;
  }
  const supabase = getServiceRoleSupabase();
  if (!supabase) return 0;
  const { error, count } = await supabase
    .from(TABLE)
    .delete({ count: "exact" })
    .gte("id", 0); // 全件
  if (error) {
    console.warn("[apde] clearDiscoveryQueue failed", error);
    return 0;
  }
  return count ?? 0;
}
