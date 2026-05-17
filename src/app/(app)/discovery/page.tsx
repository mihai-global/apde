// /discovery (探索進捗) ページ (R7)。
// R6 cron が積み上げた market_analysis を「カテゴリ × 価格帯」のヒートマップで可視化する。
// Foundation 層 (discovery_stats / discovery_queue) を呼ぶだけの Server Component。

import Link from "next/link";
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

  // ヒートマップ内の総件数 vs 全評価済み総数。 大幅に乖離していたら「leaf カテゴリで
  // 保存されている過去データが多い → 再分類が必要」のサインなのでバナー表示。
  const heatmapTotal = heatmap.reduce((s, c) => s + c.asinCount, 0);
  const reclassifyNeeded =
    coverage.totalAsins > 50 && heatmapTotal < coverage.totalAsins * 0.5;

  return (
    <main className="page">
      <div className="shell">
        <Crumbs items={[{ label: "ダッシュボード", href: "/" }, { label: "進捗" }]} />
        <h1 className="h1">探索進捗</h1>
        <p className="muted" style={{ fontSize: 14, marginBottom: 32 }}>
          R6 cron が積み上げた市場分析の進捗を、 カテゴリ × 価格帯で可視化します。
          セルをクリックすると /search に絞り込み済みで遷移します。
        </p>

        {reclassifyNeeded ? (
          <div
            style={{
              padding: "14px 18px",
              border: "1px solid var(--decision-cond)",
              background: "var(--decision-cond-bg)",
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg-1)" }}>
              <strong>カテゴリ再分類が必要です</strong>: 評価済み{" "}
              <strong>{coverage.totalAsins} 件</strong>のうち、
              ヒートマップに反映できているのは <strong>{heatmapTotal} 件</strong>のみ
              ({((heatmapTotal / Math.max(coverage.totalAsins, 1)) * 100).toFixed(0)}%)。
              <br />
              過去 ingest が Keepa の leaf カテゴリで保存されているため、 14 root カテゴリと
              照合できていません。 /diagnostics の「カテゴリ再分類」ボタンで一括上書きできます
              (1 ASIN ≈ 1 token)。
            </div>
            <Link href="/diagnostics" className="pill solid" style={{ flexShrink: 0 }}>
              診断ページへ <span className="arrow">›</span>
            </Link>
          </div>
        ) : null}

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
