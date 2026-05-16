// /discovery ページ最上段の概要 KPI 4 枚 (Server Component)。
// 既存 .kpi クラス (src/app/globals.css:597+) を流用。

import { fmtNum } from "@/lib/format";
import type {
  DiscoveryCoverage,
  ThroughputStats,
} from "@/lib/supabase/discovery_stats";

interface Props {
  coverage: DiscoveryCoverage;
  throughput: ThroughputStats;
}

function goRatioLabel(go: number, total: number): string {
  if (total <= 0) return "—";
  const pct = (go / total) * 100;
  return `全体の ${pct.toFixed(1)}%`;
}

export function CoverageOverview({ coverage, throughput }: Props) {
  const { totalAsins, added24h, go, cond, noGo, avgScore } = coverage;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 24,
      }}
    >
      {/* 1) 評価済み ASIN 総数 */}
      <div className="kpi">
        <div className="label">評価済み ASIN</div>
        <div className="val num">{fmtNum(totalAsins)}</div>
        <div className="sub">平均スコア {avgScore.toFixed(1)}</div>
      </div>

      {/* 2) 直近 24h 追加 */}
      <div className="kpi">
        <div className="label">直近 24h 追加</div>
        <div className="val num">+{fmtNum(added24h)}</div>
        <div className="sub">
          Keepa: {fmtNum(throughput.keepaTokens24h)} token / cron:{" "}
          {fmtNum(throughput.dispatchRuns24h)} ジョブ
        </div>
      </div>

      {/* 3) GO 判定 */}
      <div className="kpi go">
        <div className="label">GO 判定</div>
        <div className="val num">{fmtNum(go)}</div>
        <div className="sub">{goRatioLabel(go, totalAsins)}</div>
      </div>

      {/* 4) 判定の内訳 */}
      <div className="kpi">
        <div className="label">判定の内訳</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            marginTop: 4,
          }}
        >
          <div>
            <div
              className="num"
              style={{
                fontSize: 22,
                fontWeight: 500,
                color: "var(--decision-go)",
                lineHeight: 1.1,
              }}
            >
              {fmtNum(go)}
            </div>
            <div
              className="eyebrow"
              style={{ fontSize: 10, marginTop: 4, color: "var(--fg-4)" }}
            >
              GO
            </div>
          </div>
          <div>
            <div
              className="num"
              style={{
                fontSize: 22,
                fontWeight: 500,
                color: "var(--decision-cond)",
                lineHeight: 1.1,
              }}
            >
              {fmtNum(cond)}
            </div>
            <div
              className="eyebrow"
              style={{ fontSize: 10, marginTop: 4, color: "var(--fg-4)" }}
            >
              COND
            </div>
          </div>
          <div>
            <div
              className="num"
              style={{
                fontSize: 22,
                fontWeight: 500,
                color: "var(--decision-no)",
                lineHeight: 1.1,
              }}
            >
              {fmtNum(noGo)}
            </div>
            <div
              className="eyebrow"
              style={{ fontSize: 10, marginTop: 4, color: "var(--fg-4)" }}
            >
              NO_GO
            </div>
          </div>
        </div>
        <div className="sub" style={{ marginTop: 12 }}>
          ingest 24h: {fmtNum(throughput.ingest24h)} 行
        </div>
      </div>
    </div>
  );
}
