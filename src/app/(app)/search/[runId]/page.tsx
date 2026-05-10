import { notFound } from "next/navigation";
import { CandidateListView } from "@/components/list/CandidateListView";
import { Crumbs } from "@/components/shell/Crumbs";
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
        <div className="muted" style={{ marginBottom: 32 }}>
          {run.candidates.length}件の候補 / 別途{run.excluded_candidates.length}件を自動除外
          {run.filters.keyword
            ? ` · キーワード "${run.filters.keyword}"`
            : " · カテゴリ全体"}
          {typeof run.filters.minPrice === "number" || typeof run.filters.maxPrice === "number"
            ? ` · 価格 ${run.filters.minPrice ? yen(run.filters.minPrice) : "〜"}${run.filters.maxPrice ? `〜${yen(run.filters.maxPrice)}` : "+"}`
            : ""}
          {typeof run.filters.maxReviews === "number" ? ` · レビュー ≤${run.filters.maxReviews}` : ""}
          {" · 取得 "}{formatDateTime(run.created_at)}
        </div>

        <CandidateListView candidates={run.candidates} excluded={run.excluded_candidates} />
      </div>
    </main>
  );
}
