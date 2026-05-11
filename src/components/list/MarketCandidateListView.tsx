"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MonthlySalesProvenance } from "@/components/primitives/MonthlySalesProvenance";
import { ScoreBar } from "@/components/primitives/ScoreBar";
import { Thumbnail } from "@/components/primitives/Thumbnail";
import { Chip } from "@/components/primitives/Chip";
import { Seg } from "@/components/primitives/Seg";
import { fmtNum, yen } from "@/lib/format";
import type { MarketDecision } from "@/lib/types";

/** /search 画面で渡される 1 行分のデータ。 listMarketAnalysis() の戻り値と同形。 */
export interface MarketCandidateRow {
  asin: string;
  title: string;
  category: string;
  brand: string | null;
  imageUrl: string | null;
  marketScore: number | null;
  decision: MarketDecision | null;
  axisDemand: number | null;
  axisCompetition: number | null;
  axisProfit: number | null;
  axisStability: number | null;
  axisDifferentiation: number | null;
  gatesPassed: number | null;
  gatesFailed: string[];
  monthlySalesSource: "keepa" | "bsr" | "seed" | null;
  // snapshot 由来
  currentPriceYen: number | null;
  countReviews: number | null;
  monthlySold: number | null;
  bsr: number | null;
  weightG: number | null;
  fetchedAt: string | null;
}

interface MarketCandidateListViewProps {
  rows: MarketCandidateRow[];
  /** 上部に表示する集計カードを表示しない場合に false (空状態などで使う) */
  showSummary?: boolean;
}

type SortKey = "score" | "oem" | "demand" | "profit" | "price" | "review";
type FilterKey = "all" | MarketDecision;

const DECISION_LABEL: Record<MarketDecision, string> = {
  go: "GO",
  cond: "条件付き",
  no_go: "NO-GO",
};

const DECISION_TONE: Record<MarketDecision, string> = {
  go: "go",
  cond: "cond",
  no_go: "no",
};

function asinSeed(asin: string): number {
  let acc = 0;
  for (const ch of asin) acc = (acc * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(acc);
}

export function MarketCandidateListView({
  rows,
  showSummary = true,
}: MarketCandidateListViewProps) {
  const [sort, setSort] = useState<SortKey>("score");
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    const arr = filter === "all" ? [...rows] : rows.filter((r) => r.decision === filter);
    arr.sort((a, b) => {
      switch (sort) {
        case "score":
          return (b.marketScore ?? 0) - (a.marketScore ?? 0);
        case "oem":
          return (b.axisDifferentiation ?? 0) - (a.axisDifferentiation ?? 0);
        case "demand":
          return (b.axisDemand ?? 0) - (a.axisDemand ?? 0);
        case "profit":
          return (b.axisProfit ?? 0) - (a.axisProfit ?? 0);
        case "price":
          return (a.currentPriceYen ?? Infinity) - (b.currentPriceYen ?? Infinity);
        case "review":
          return (a.countReviews ?? Infinity) - (b.countReviews ?? Infinity);
        default:
          return 0;
      }
    });
    return arr;
  }, [rows, filter, sort]);

  const summary = useMemo(() => {
    let go = 0, cond = 0, no = 0;
    for (const r of rows) {
      if (r.decision === "go") go += 1;
      else if (r.decision === "cond") cond += 1;
      else if (r.decision === "no_go") no += 1;
    }
    return { go, cond, no, total: rows.length };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          border: "1px dashed var(--border-2)",
          textAlign: "center",
          color: "var(--fg-3)",
        }}
      >
        <p style={{ fontSize: 14, marginBottom: 8 }}>まだ candidate がありません。</p>
        <p style={{ fontSize: 12 }}>
          上部の「新カテゴリ調査」ボタンから Keepa /query を叩いて取得してください。
        </p>
      </div>
    );
  }

  return (
    <>
      {showSummary ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 24,
            marginBottom: 32,
          }}
        >
          <div className="kpi go">
            <div className="label">GO</div>
            <div className="val num">
              {summary.go}
              <span className="unit">件</span>
            </div>
            <div className="sub">market_score ≥ 70 + 全ゲート合格</div>
          </div>
          <div className="kpi cond">
            <div className="label">条件付き</div>
            <div className="val num">
              {summary.cond}
              <span className="unit">件</span>
            </div>
            <div className="sub">≥ 50 / critical ゲート合格</div>
          </div>
          <div className="kpi no">
            <div className="label">NO-GO</div>
            <div className="val num">
              {summary.no}
              <span className="unit">件</span>
            </div>
            <div className="sub">スコア低 or 強制ゲート発動</div>
          </div>
          <div className="kpi">
            <div className="label">合計</div>
            <div className="val num">
              {summary.total}
              <span className="unit">件</span>
            </div>
            <div className="sub">market_analysis 行数</div>
          </div>
        </div>
      ) : null}

      <div className="rowsplit" style={{ marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div className="cluster">
          <span className="eyebrow" style={{ marginRight: 4 }}>判定</span>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>すべて</Chip>
          <Chip active={filter === "go"} onClick={() => setFilter("go")}>GO</Chip>
          <Chip active={filter === "cond"} onClick={() => setFilter("cond")}>条件付き</Chip>
          <Chip active={filter === "no_go"} onClick={() => setFilter("no_go")}>NO-GO</Chip>
        </div>
        <div className="cluster">
          <Seg<SortKey>
            value={sort}
            options={[
              { value: "score", label: "市場魅力度" },
              { value: "oem", label: "OEM適性" },
              { value: "demand", label: "需要" },
              { value: "profit", label: "利益" },
              { value: "price", label: "価格" },
              { value: "review", label: "レビュー数" },
            ]}
            onChange={setSort}
          />
        </div>
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 32 }} aria-label="展開" />
            <th style={{ width: 120 }}>判定</th>
            <th className="col-title">商品</th>
            <th style={{ width: 130 }}>市場魅力度</th>
            <th style={{ width: 110 }} title="OEM 再現性 + 差別化余地 + 複雑度 + ブランド独立性の合成 (0-100)">
              OEM適性
            </th>
            <th className="right">価格</th>
            <th className="right">月販</th>
            <th className="right">レビュー</th>
            <th>失格ゲート</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <MarketRow key={r.asin} r={r} />
          ))}
        </tbody>
      </table>
    </>
  );
}

function MarketRow({ r }: { r: MarketCandidateRow }) {
  const [expanded, setExpanded] = useState(false);
  const tone = r.decision ? DECISION_TONE[r.decision] : "no";
  const label = r.decision ? DECISION_LABEL[r.decision] : "—";

  return (
    <>
      <tr onClick={() => window.location.assign(`/products/${r.asin}`)}>
        <td onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "詳細を閉じる" : "詳細を開く"}
            style={{ padding: "4px 8px", fontSize: 12 }}
          >
            {expanded ? "▾" : "▸"}
          </button>
        </td>
        <td>
          <span className={`dbadge style-pill tone-${tone}`}>
            <span className="dot" />
            {label}
          </span>
        </td>
        <td className="col-title">
          <div className="title-cell">
            <Thumbnail
              src={r.imageUrl ?? undefined}
              alt={r.title}
              seed={asinSeed(r.asin)}
              size={56}
            />
            <div className="meta">
              <Link
                href={`/products/${r.asin}`}
                className="pname"
                onClick={(e) => e.stopPropagation()}
              >
                {r.title}
              </Link>
              <div className="pasin">
                {r.asin}
                {r.brand ? ` · ${r.brand}` : ""}
              </div>
            </div>
          </div>
        </td>
        <td>
          <ScoreBar score={Math.round(r.marketScore ?? 0)} />
        </td>
        <td title="OEM 再現性 + 差別化余地 + 複雑度 + ブランド独立性の合成 (0-100)">
          <ScoreBar score={Math.round(r.axisDifferentiation ?? 0)} />
        </td>
        <td className="right num">{r.currentPriceYen ? yen(r.currentPriceYen) : "—"}</td>
        <td className="right num">
          {r.monthlySold !== null ? `${fmtNum(r.monthlySold)}/月` : "—"}
          {r.monthlySalesSource ? (
            <MonthlySalesProvenance source={r.monthlySalesSource} compact />
          ) : null}
        </td>
        <td className="right num">{r.countReviews !== null ? fmtNum(r.countReviews) : "—"}</td>
        <td className="concern">
          {r.gatesFailed.length > 0 ? (
            r.gatesFailed.join(", ")
          ) : (
            <span className="muted">—</span>
          )}
        </td>
      </tr>
      {expanded ? <AxisDetailRow r={r} /> : null}
    </>
  );
}

const AXIS_LABELS: Array<{ key: keyof Pick<MarketCandidateRow, "axisDemand" | "axisCompetition" | "axisProfit" | "axisStability" | "axisDifferentiation">; label: string; tip: string }> = [
  { key: "axisDemand", label: "需要", tip: "monthly_sold (or BSR 推定) を 0..1500 でスケーリング" },
  { key: "axisCompetition", label: "競争", tip: "レビュー数 × ブランド強度で参入余地を評価" },
  { key: "axisProfit", label: "利益", tip: "価格帯適合 + 粗利率の平均" },
  { key: "axisStability", label: "安定性", tip: "90日価格変動 + セール頻度から算出" },
  { key: "axisDifferentiation", label: "差別化", tip: "OEM 適性 (再現性 / 複雑度 / ブランド独立)" },
];

function AxisDetailRow({ r }: { r: MarketCandidateRow }) {
  return (
    <tr>
      <td colSpan={9} style={{ background: "var(--bg-2)", padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 12 }}>
          {AXIS_LABELS.map((axis) => {
            const value = r[axis.key] ?? 0;
            return (
              <div key={axis.key} title={axis.tip}>
                <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{axis.label}</div>
                <ScoreBar score={value} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 12, color: "var(--fg-2)" }}>
          <div>
            <span className="muted">合格ゲート: </span>
            <span className="num">{r.gatesPassed ?? 0} / 8</span>
          </div>
          <div>
            <span className="muted">失格ゲート: </span>
            {r.gatesFailed.length > 0 ? (
              <span style={{ color: "var(--decision-no)" }}>
                {r.gatesFailed.join(", ")}
              </span>
            ) : (
              <span className="muted">なし</span>
            )}
          </div>
          {r.fetchedAt ? (
            <div>
              <span className="muted">最終取得: </span>
              <span>{new Date(r.fetchedAt).toLocaleString("ja-JP")}</span>
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
