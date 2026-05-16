"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DBadge } from "@/components/primitives/DBadge";
import { MonthlySalesProvenance } from "@/components/primitives/MonthlySalesProvenance";
import { ScoreBar } from "@/components/primitives/ScoreBar";
import { Thumbnail } from "@/components/primitives/Thumbnail";
import { Chip } from "@/components/primitives/Chip";
import { Seg } from "@/components/primitives/Seg";
import { fmtNum, formatSizeTier, yen } from "@/lib/format";
import type { Decision, DiscoveryCandidate, ExcludedCandidate } from "@/lib/types";

interface CandidateListViewProps {
  candidates: DiscoveryCandidate[];
  excluded: ExcludedCandidate[];
}

type SortKey = "score" | "margin" | "sales" | "price" | "review";
type LayoutKey = "table" | "card";
type FilterKey = "all" | Decision;

function asinSeed(asin: string): number {
  let acc = 0;
  for (const ch of asin) acc = (acc * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(acc);
}

export function CandidateListView({ candidates, excluded }: CandidateListViewProps) {
  const [layout, setLayout] = useState<LayoutKey>("table");
  const [sort, setSort] = useState<SortKey>("score");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showExcluded, setShowExcluded] = useState(true);

  const filtered = useMemo(() => {
    const arr = filter === "all" ? [...candidates] : candidates.filter((c) => c.decision === filter);
    arr.sort((a, b) => {
      switch (sort) {
        case "score":
          return b.score - a.score;
        case "margin":
          return b.grossMarginRate - a.grossMarginRate;
        case "sales":
          return b.monthlyRevenueEstimate - a.monthlyRevenueEstimate;
        case "price":
          return a.currentPrice - b.currentPrice;
        case "review":
          return a.reviewCount - b.reviewCount;
        default:
          return 0;
      }
    });
    return arr;
  }, [candidates, filter, sort]);

  const summary = useMemo(() => {
    const go = candidates.filter((c) => c.decision === "GO").length;
    const cond = candidates.filter((c) => c.decision === "CONDITIONAL_GO").length;
    const no = candidates.filter((c) => c.decision === "NO_GO").length;
    return { go, cond, no, total: candidates.length };
  }, [candidates]);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 40 }}>
        <div className="kpi go">
          <div className="label">GO</div>
          <div className="val num">{summary.go}<span className="unit">件</span></div>
          <div className="sub">合計スコア 75 以上 + 全ゲート合格</div>
        </div>
        <div className="kpi cond">
          <div className="label">条件付き GO</div>
          <div className="val num">{summary.cond}<span className="unit">件</span></div>
          <div className="sub">スコア 60 以上 / NO-GO ゲートなし</div>
        </div>
        <div className="kpi no">
          <div className="label">NO-GO</div>
          <div className="val num">
            {summary.no}<span className="unit">件</span>
          </div>
          <div className="sub">下位スコア or 強制ゲート発動</div>
        </div>
        <div className="kpi">
          <div className="label">自動除外</div>
          <div className="val num">{excluded.length}<span className="unit">件</span></div>
          <div className="sub">サイズ・規制・辞書による事前除外</div>
        </div>
      </div>

      <div
        className="muted"
        style={{ fontSize: 11, marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap" }}
      >
        <span>想定月商の信頼度:</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--decision-go)", display: "inline-block" }} />
          Keepa 実測
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--decision-cond)", display: "inline-block" }} />
          BSR 推定 (荒い)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--fg-4)", display: "inline-block" }} />
          モック
        </span>
      </div>

      <div className="rowsplit" style={{ marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div className="cluster">
          <span className="eyebrow" style={{ marginRight: 4 }}>判定</span>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>すべて</Chip>
          <Chip active={filter === "GO"} onClick={() => setFilter("GO")}>GO</Chip>
          <Chip active={filter === "CONDITIONAL_GO"} onClick={() => setFilter("CONDITIONAL_GO")}>条件付き</Chip>
          <Chip active={filter === "NO_GO"} onClick={() => setFilter("NO_GO")}>NO-GO</Chip>
        </div>
        <div className="cluster">
          <Seg<LayoutKey>
            value={layout}
            options={[{ value: "table", label: "テーブル" }, { value: "card", label: "カード" }]}
            onChange={setLayout}
          />
          <Seg<SortKey>
            value={sort}
            options={[
              { value: "score", label: "スコア" },
              { value: "margin", label: "粗利率" },
              { value: "sales", label: "想定月商" },
              { value: "price", label: "価格" },
              { value: "review", label: "レビュー数" },
            ]}
            onChange={setSort}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: showExcluded ? "1fr 320px" : "1fr", gap: 32 }}>
        <div>
          {layout === "table" ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>判定</th>
                  <th className="col-title">商品</th>
                  <th style={{ width: 120 }}>スコア</th>
                  <th className="right">想定月商</th>
                  <th className="right">粗利率</th>
                  <th>サイズ</th>
                  <th>競争</th>
                  <th>主な懸念</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <CandidateRow key={c.asin} c={c} />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="cgrid">
              {filtered.map((c) => (
                <CandidateCard key={c.asin} c={c} />
              ))}
            </div>
          )}
        </div>

        {showExcluded ? (
          <aside className="exc-pane">
            <div className="rowsplit" style={{ marginBottom: 8 }}>
              <div className="eyebrow">自動除外 ({excluded.length})</div>
              <button className="btn-ghost" onClick={() => setShowExcluded(false)}>閉じる</button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 16px" }}>
              探索段階で除外された候補。透明性のため理由付きで保持。
            </p>
            {excluded.length === 0 ? (
              <div className="muted" style={{ fontSize: 12 }}>該当なし</div>
            ) : (
              excluded.map((e) => (
                <div key={e.asin} className="exc-row">
                  <span className="reason">{e.reason}</span>
                  <span className="ptitle">{e.title}</span>
                  <span className="pasin">{e.asin}</span>
                </div>
              ))
            )}
          </aside>
        ) : (
          <div style={{ marginTop: 24 }}>
            <button className="btn-text" onClick={() => setShowExcluded(true)}>
              除外候補を表示 ({excluded.length}件) ›
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function CandidateRow({ c }: { c: DiscoveryCandidate }) {
  return (
    <tr onClick={() => window.location.assign(`/products/${c.asin}`)}>
      <td><DBadge decision={c.decision} /></td>
      <td className="col-title">
        <div className="title-cell">
          <Thumbnail src={c.imageUrl} alt={c.title} seed={asinSeed(c.asin)} label={c.asin.slice(0, 2)} size={72} />
          <div className="meta">
            <Link href={`/products/${c.asin}`} className="pname" onClick={(e) => e.stopPropagation()}>
              {c.title}
            </Link>
            <div className="pasin">{c.asin} · {c.brand}</div>
          </div>
        </div>
      </td>
      <td><ScoreBar score={c.score} /></td>
      <td className="right num">
        {yen(c.monthlyRevenueEstimate)}
        <MonthlySalesProvenance source={c.monthlySalesSource} compact />
      </td>
      <td className="right num" style={{ color: c.grossMarginRate < 30 ? "var(--danger)" : "inherit" }}>
        {c.grossMarginRate}%
      </td>
      <td><span className="tag">{c.weightGrams}g · {formatSizeTier(c.sizeTier)}</span></td>
      <td><span className="tag">レビュー {fmtNum(c.reviewCount)}</span></td>
      <td className="concern">{c.concern}</td>
    </tr>
  );
}

function CandidateCard({ c }: { c: DiscoveryCandidate }) {
  return (
    <Link href={`/products/${c.asin}`} className="pcard">
      <div className="ptop">
        <Thumbnail src={c.imageUrl} alt={c.title} seed={asinSeed(c.asin)} label={c.asin.slice(0, 2)} size={80} />
        <div style={{ flex: 1 }}>
          <DBadge decision={c.decision} />
          <h3 className="ph3" style={{ marginTop: 8 }}>{c.title}</h3>
          <div className="pasin">{c.asin} · {c.brand}</div>
        </div>
      </div>
      <dl>
        <div><dt>スコア</dt><dd className="num">{c.score} / 100</dd></div>
        <div>
          <dt>粗利率</dt>
          <dd className="num" style={{ color: c.grossMarginRate < 30 ? "var(--danger)" : "inherit" }}>
            {c.grossMarginRate}%
          </dd>
        </div>
        <div>
          <dt>想定月商</dt>
          <dd className="num">
            {yen(c.monthlyRevenueEstimate)}
            <MonthlySalesProvenance source={c.monthlySalesSource} compact />
          </dd>
        </div>
        <div><dt>レビュー</dt><dd className="num">{fmtNum(c.reviewCount)}</dd></div>
      </dl>
      <div style={{ marginTop: 16, fontSize: 12, color: "var(--fg-3)", borderTop: "1px solid var(--border-1)", paddingTop: 12 }}>
        {c.concern}
      </div>
    </Link>
  );
}
