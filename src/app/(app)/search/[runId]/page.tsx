import { notFound } from "next/navigation";
import { CandidateListView } from "@/components/list/CandidateListView";
import { Crumbs } from "@/components/shell/Crumbs";
import { mockMode } from "@/lib/env";
import { formatDateTime, yen } from "@/lib/format";
import { getDiscoveryRun } from "@/lib/supabase/repositories";

export const dynamic = "force-dynamic";

export default async function CandidatesPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getDiscoveryRun(runId);
  if (!run) notFound();

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: 1360 }}>
        <Crumbs
          items={[
            { label: "ダッシュボード", href: "/" },
            { label: "探索", href: "/search" },
            { label: run.category },
          ]}
        />
        <div className="rowsplit" style={{ marginBottom: 8 }}>
          <div>
            <div className="eyebrow">候補一覧</div>
            <h1 className="h1" style={{ marginTop: 8 }}>{run.category}</h1>
          </div>
        </div>
        <div className="muted" style={{ marginBottom: 16 }}>
          {run.candidates.length}件の候補 / 別途{run.excluded_candidates.length}件を自動除外
          {run.filters.keyword
            ? ` · キーワード "${run.filters.keyword}"`
            : " · カテゴリ全体"}
          {typeof run.filters.minPrice === "number" || typeof run.filters.maxPrice === "number"
            ? ` · 価格 ${run.filters.minPrice ? yen(run.filters.minPrice) : "〜"}${run.filters.maxPrice ? `〜${yen(run.filters.maxPrice)}` : "+"}`
            : ""}
          {typeof run.filters.maxReviews === "number" ? ` · レビュー ≤${run.filters.maxReviews}` : ""}
          {" · 取得 "}{formatDateTime(run.created_at)}
          {" · データソース "}<strong>{run.source.toUpperCase()}</strong>
        </div>

        {run.source === "mock" && !mockMode.keepa ? (
          <div
            style={{
              marginBottom: 32,
              padding: 16,
              border: "1px solid var(--decision-cond)",
              background: "var(--decision-cond-bg)",
              fontSize: 13,
              lineHeight: 1.7,
            }}
            role="alert"
          >
            <strong style={{ color: "var(--decision-cond)" }}>
              ⚠ Keepa からデータを取得できませんでした (rate limit / トークン残高不足の可能性)
            </strong>
            <div style={{ marginTop: 6 }}>
              以下の候補は <strong>mock データ</strong> です (Keepa 失敗時のフォールバック)。
              実データを取得するには:
            </div>
            <ol style={{ paddingLeft: 20, margin: "6px 0 0 0" }}>
              <li>
                <a href="/diagnostics" className="btn-text blue">/diagnostics</a> を開いて
                「Keepa /query Probe」で <code>tokensLeft</code> の値を確認
              </li>
              <li>負の値なら数分〜数十分待つ (free-tier は ≈1 token / 分で補充)</li>
              <li>頻繁に枯渇する場合は Keepa プランをアップグレード</li>
            </ol>
          </div>
        ) : null}

        <CandidateListView candidates={run.candidates} excluded={run.excluded_candidates} />
      </div>
    </main>
  );
}
