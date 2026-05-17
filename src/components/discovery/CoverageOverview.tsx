// /discovery ページ最上段の概要 KPI (Server Component)。
// R7 改修: 数字を大きく (48-64px)、 判定の内訳は「スタック横バー」で視覚化。

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
  return `全体の ${((go / total) * 100).toFixed(1)}%`;
}

export function CoverageOverview({ coverage, throughput }: Props) {
  const { totalAsins, added24h, go, cond, noGo, avgScore } = coverage;
  const denom = Math.max(totalAsins, 1);
  const goPct = (go / denom) * 100;
  const condPct = (cond / denom) * 100;
  const noGoPct = (noGo / denom) * 100;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
      {/* 1) 評価済み ASIN 総数 */}
      <BigKpiCard
        label="評価済み ASIN"
        value={fmtNum(totalAsins)}
        sub={`平均スコア ${avgScore.toFixed(1)}`}
      />

      {/* 2) 直近 24h 追加 */}
      <BigKpiCard
        label="直近 24h 追加"
        value={`+${fmtNum(added24h)}`}
        tone="cond"
        sub={`Keepa ${fmtNum(throughput.keepaTokens24h)} token · cron ${fmtNum(throughput.dispatchRuns24h)} ジョブ`}
      />

      {/* 3) GO 判定 */}
      <BigKpiCard
        label="GO 判定"
        value={fmtNum(go)}
        tone="go"
        sub={goRatioLabel(go, totalAsins)}
      />

      {/* 4) 判定の内訳 (スタック横バー) */}
      <div
        className="kpi"
        style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
      >
        <div className="label">判定の内訳</div>

        {/* スタックバー */}
        <div
          style={{
            marginTop: 12,
            height: 24,
            background: "var(--bg-2)",
            display: "flex",
            overflow: "hidden",
          }}
          aria-label={`GO ${fmtNum(go)} / 条件付き ${fmtNum(cond)} / NO_GO ${fmtNum(noGo)}`}
        >
          <DecisionSegment width={goPct} background="var(--decision-go)" />
          <DecisionSegment width={condPct} background="var(--decision-cond)" />
          <DecisionSegment width={noGoPct} background="var(--decision-no)" />
        </div>

        {/* legend (数字 + ラベル) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            marginTop: 12,
            fontFeatureSettings: '"tnum" 1',
          }}
        >
          <DecisionLegend label="GO" value={go} color="var(--decision-go)" />
          <DecisionLegend label="COND" value={cond} color="var(--decision-cond)" />
          <DecisionLegend label="NO_GO" value={noGo} color="var(--decision-no)" />
        </div>

        <div className="sub" style={{ marginTop: 12 }}>
          ingest 24h: {fmtNum(throughput.ingest24h)} 行
        </div>
      </div>
    </div>
  );
}

// ─── 内部用 ─────────────────────────────────────────────────────────

type Tone = "default" | "go" | "cond";

function BigKpiCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: Tone;
}) {
  const color =
    tone === "go"
      ? "var(--decision-go)"
      : tone === "cond"
        ? "var(--decision-cond)"
        : "var(--fg-1)";
  return (
    <div className="kpi" style={{ borderTopColor: color }}>
      <div className="label">{label}</div>
      <div
        className="num"
        style={{
          fontSize: 48,
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: "-0.015em",
          color,
          marginTop: 8,
        }}
      >
        {value}
      </div>
      <div className="sub" style={{ marginTop: 12 }}>
        {sub}
      </div>
    </div>
  );
}

function DecisionSegment({ width, background }: { width: number; background: string }) {
  if (width <= 0) return null;
  return (
    <div
      style={{
        width: `${width}%`,
        height: "100%",
        background,
        transition: "width 0.3s ease",
      }}
    />
  );
}

function DecisionLegend({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          letterSpacing: "0.08em",
          color: "var(--fg-4)",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            background: color,
          }}
        />
        {label}
      </div>
      <div
        className="num"
        style={{
          marginTop: 4,
          fontSize: 24,
          fontWeight: 500,
          color,
          lineHeight: 1,
        }}
      >
        {fmtNum(value)}
      </div>
    </div>
  );
}
