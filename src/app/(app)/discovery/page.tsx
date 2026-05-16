// /discovery (探索進捗) ページ (R7)。
// R6 cron が積み上げた market_analysis を「カテゴリ × 価格帯」のヒートマップで可視化する。
// Foundation 層 (discovery_stats / discovery_queue) を呼ぶだけの Server Component。

import { CategoryHeatmap } from "@/components/discovery/CategoryHeatmap";
import { CoverageOverview } from "@/components/discovery/CoverageOverview";
import { NextJobsPreview } from "@/components/discovery/NextJobsPreview";
import { Crumbs } from "@/components/shell/Crumbs";
import { peekNextDiscoveryJobs } from "@/lib/supabase/discovery_queue";
import {
  getCategoryPriceBandHeatmap,
  getDiscoveryCoverage,
  getDiscoveryThroughput24h,
} from "@/lib/supabase/discovery_stats";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const [coverage, heatmap, nextJobs, throughput] = await Promise.all([
    getDiscoveryCoverage(),
    getCategoryPriceBandHeatmap(),
    peekNextDiscoveryJobs(5),
    getDiscoveryThroughput24h(),
  ]);

  return (
    <main className="page">
      <div className="shell">
        <Crumbs items={[{ label: "ダッシュボード", href: "/" }, { label: "進捗" }]} />
        <h1 className="h1">探索進捗</h1>
        <p className="muted" style={{ fontSize: 14, marginBottom: 32 }}>
          R6 cron が積み上げた市場分析の進捗を、 カテゴリ × 価格帯で可視化します。
          セルをクリックすると /search に絞り込み済みで遷移します。
        </p>

        <section style={{ marginBottom: 40 }}>
          <CoverageOverview coverage={coverage} throughput={throughput} />
        </section>

        <section style={{ marginBottom: 40 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            カテゴリ × 価格帯 ヒートマップ
          </div>
          <CategoryHeatmap cells={heatmap} />
        </section>

        <section style={{ marginBottom: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            次に取得予定 (上位 5 件)
          </div>
          <NextJobsPreview jobs={nextJobs} />
        </section>
      </div>
    </main>
  );
}
