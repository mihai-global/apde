"use client";

import type { FormEvent } from "react";
import { useDeferredValue, useId, useMemo, useState, useTransition } from "react";
import { AnalysisResult, AsinMetrics, DiscoveryCandidate, DiscoveryResponse } from "@/lib/types";

type FormState = {
  category: string;
  minPrice: string;
  maxPrice: string;
  maxReviews: string;
  limit: string;
};

const initialForm: FormState = {
  category: "デスク周り",
  minPrice: "3000",
  maxPrice: "8000",
  maxReviews: "500",
  limit: "20"
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDecision(value: AnalysisResult["decision"] | DiscoveryCandidate["decision"]): string {
  if (value === "GO") return "GO";
  if (value === "CONDITIONAL_GO") return "条件付きGO";
  return "NO-GO";
}

function formatCompetition(value: DiscoveryCandidate["competitionLevel"]): string {
  if (value === "LOW") return "低";
  if (value === "MEDIUM") return "中";
  return "高";
}

function formatRuleStatus(value: AnalysisResult["ruleChecks"][number]["status"]): string {
  if (value === "PASS") return "適合";
  if (value === "WARN") return "注意";
  return "非推奨";
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatSizeTier(value: AnalysisResult["metrics"]["sizeTier"]): string {
  if (value === "SMALL_STANDARD") return "小型";
  if (value === "LARGE_STANDARD") return "標準";
  return "大型";
}

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function Sparkline({
  values,
  title,
  formatValue,
  unit
}: {
  values: Array<{ timestamp: string; value: number }>;
  title: string;
  formatValue?: (value: number) => string;
  unit?: string;
}) {
  const reactId = useId();
  const lineGradId = `spark-line-${reactId}`;
  const areaGradId = `spark-area-${reactId}`;

  const VIEW_W = 100;
  const VIEW_H = 40;
  const PAD = 3;

  const geometry = useMemo(() => {
    const numbers = values.map((item) => item.value);
    if (numbers.length === 0) {
      return {
        min: 0,
        max: 0,
        last: 0,
        changeRate: 0,
        linePoints: "",
        areaPoints: "",
        lastX: 0,
        lastY: VIEW_H - PAD
      };
    }
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const range = Math.max(max - min, 1);
    const stepX = numbers.length > 1 ? VIEW_W / (numbers.length - 1) : 0;

    const coords = numbers.map((value, index) => {
      const x = index * stepX;
      const y = VIEW_H - PAD - ((value - min) / range) * (VIEW_H - PAD * 2);
      return { x, y };
    });

    const linePoints = coords.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const areaPoints = `0,${VIEW_H} ${linePoints} ${(coords[coords.length - 1]?.x ?? 0).toFixed(2)},${VIEW_H}`;
    const last = numbers[numbers.length - 1] ?? 0;
    const first = numbers[0] ?? 0;
    const changeRate = first === 0 ? 0 : ((last - first) / first) * 100;
    const lastCoord = coords[coords.length - 1] ?? { x: 0, y: VIEW_H - PAD };

    return {
      min,
      max,
      last,
      changeRate,
      linePoints,
      areaPoints,
      lastX: lastCoord.x,
      lastY: lastCoord.y
    };
  }, [values]);

  const renderValue = (value: number): string => {
    if (formatValue) return `${formatValue(value)}${unit ? ` ${unit}` : ""}`;
    return `${value.toLocaleString("ja-JP")}${unit ? ` ${unit}` : ""}`;
  };

  const trend = geometry.changeRate > 1 ? "up" : geometry.changeRate < -1 ? "down" : "flat";

  return (
    <div className="chart-card">
      <strong>{title}</strong>
      <div className="sparkline-wrap" aria-hidden="true">
        <svg
          className="sparkline-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title} 折れ線グラフ`}
        >
          <defs>
            <linearGradient id={lineGradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
            <linearGradient id={areaGradId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(139, 92, 246, 0.22)" />
              <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
            </linearGradient>
          </defs>
          {geometry.linePoints ? (
            <>
              <polygon points={geometry.areaPoints} fill={`url(#${areaGradId})`} />
              <polyline
                points={geometry.linePoints}
                fill="none"
                stroke={`url(#${lineGradId})`}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={geometry.lastX}
                cy={geometry.lastY}
                r="1.8"
                fill="#ec4899"
                stroke="white"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </svg>
      </div>
      <div className="chart-stats">
        <div>
          <span>現在</span>
          <strong>{renderValue(geometry.last)}</strong>
        </div>
        <div>
          <span>最大</span>
          <strong>{renderValue(geometry.max)}</strong>
        </div>
        <div>
          <span>最小</span>
          <strong>{renderValue(geometry.min)}</strong>
        </div>
        <div>
          <span>変化率</span>
          <strong data-trend={trend}>
            {geometry.changeRate > 0 ? "+" : ""}
            {geometry.changeRate.toFixed(1)}%
          </strong>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  max
}: {
  label: string;
  value: number;
  max: number;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const tone = ratio >= 0.7 ? "GO" : ratio >= 0.4 ? "WARN" : "FAIL";
  const displayValue = Math.round(value);
  return (
    <div className="score-bar">
      <div className="score-bar__head">
        <span className="score-bar__label">{label}</span>
        <span className="score-bar__value">
          {displayValue}
          <span>/{max}</span>
        </span>
      </div>
      <div
        className="score-bar__track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="score-bar__fill"
          data-tone={tone}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function SkeletonCandidates({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton skeleton--candidate" />
      ))}
    </div>
  );
}

function SkeletonAnalysis() {
  return (
    <div className="skeleton--analysis" aria-hidden="true">
      <div className="skeleton skeleton--bar-lg" />
      <div className="skeleton skeleton--bar-md" />
      <div className="skeleton skeleton--bar-sm" />
      <div className="skeleton skeleton--bar-sm" />
      <div className="skeleton skeleton--bar-md" />
    </div>
  );
}

type ProfitBreakdown = {
  sellingPrice: number;
  amazonReferralFee: number;
  fbaFee: number;
  cogs: number;
  grossProfit: number;
  adSpendPerUnit: number;
  netProfitPerUnit: number;
  netMarginRate: number;
  netProfitMonthly: number;
};

// FBA手数料は概算 (重量ベース)。SP-API Product Fees API 接続後に置き換える。
function estimateFbaFee(weightGrams: number, sizeTier: AsinMetrics["sizeTier"]): number {
  if (sizeTier === "OVERSIZE" || weightGrams > 1000) return 589;
  if (weightGrams <= 200) return 290;
  if (weightGrams <= 500) return 381;
  return 421;
}

function deriveProfitBreakdown(metrics: AsinMetrics): ProfitBreakdown {
  const sellingPrice = metrics.currentPrice;
  const amazonReferralFee = Math.round(sellingPrice * 0.10);
  const fbaFee = estimateFbaFee(metrics.weightGrams, metrics.sizeTier);
  const grossProfit = Math.round((sellingPrice * metrics.grossMarginRate) / 100);
  const cogs = Math.max(0, sellingPrice - amazonReferralFee - fbaFee - grossProfit);
  const adSpendPerUnit = Math.round(metrics.adCpcEstimate / Math.max(metrics.conversionRate, 0.01));
  const netProfitPerUnit = grossProfit - adSpendPerUnit;
  const netMarginRate = sellingPrice > 0 ? netProfitPerUnit / sellingPrice : 0;
  return {
    sellingPrice,
    amazonReferralFee,
    fbaFee,
    cogs,
    grossProfit,
    adSpendPerUnit,
    netProfitPerUnit,
    netMarginRate,
    netProfitMonthly: netProfitPerUnit * metrics.estimatedMonthlySales
  };
}

function ProfitCard({ metrics }: { metrics: AsinMetrics }) {
  const profit = deriveProfitBreakdown(metrics);
  const positive = profit.netProfitPerUnit > 0;
  return (
    <div className="profit-card">
      <div className="profit-card__head">
        <h3>1個あたりの利益構造</h3>
        <span className="profit-card__note">概算・SP-API未接続</span>
      </div>
      <div className="profit-rows">
        <div className="profit-row">
          <span>販売価格</span>
          <strong>{formatCurrency(profit.sellingPrice)}</strong>
        </div>
        <div className="profit-row profit-row--minus">
          <span>Amazon手数料 (約10%)</span>
          <strong>−{formatCurrency(profit.amazonReferralFee)}</strong>
        </div>
        <div className="profit-row profit-row--minus">
          <span>FBA手数料 (重量 {metrics.weightGrams}g)</span>
          <strong>−{formatCurrency(profit.fbaFee)}</strong>
        </div>
        <div className="profit-row profit-row--minus">
          <span>想定原価</span>
          <strong>−{formatCurrency(profit.cogs)}</strong>
        </div>
        <div className="profit-row profit-row--sum">
          <span>粗利</span>
          <strong>
            {formatCurrency(profit.grossProfit)} ({formatPercent(metrics.grossMarginRate)})
          </strong>
        </div>
        <div className="profit-row profit-row--minus">
          <span>想定広告費 (CPC÷CVR)</span>
          <strong>−{formatCurrency(profit.adSpendPerUnit)}</strong>
        </div>
      </div>
      <div className="profit-total" data-positive={String(positive)}>
        <div>
          <span className="profit-total__label">想定最終利益（1個）</span>
          <strong className="profit-total__value">{formatCurrency(profit.netProfitPerUnit)}</strong>
          <span className="profit-total__rate">
            純利益率 {formatPercent(Math.round(profit.netMarginRate * 100))}
          </span>
        </div>
        <div className="profit-total__monthly">
          <span>月想定 ({metrics.estimatedMonthlySales.toLocaleString("ja-JP")}個)</span>
          <strong>{formatCurrency(profit.netProfitMonthly)}</strong>
        </div>
      </div>
    </div>
  );
}

function KpiBanner({ candidates }: { candidates: DiscoveryCandidate[] }) {
  const total = candidates.length;
  const go = candidates.filter((item) => item.decision === "GO").length;
  const cond = candidates.filter((item) => item.decision === "CONDITIONAL_GO").length;
  const noGo = candidates.filter((item) => item.decision === "NO_GO").length;
  const topScore = candidates.reduce((acc, item) => (item.score > acc ? item.score : acc), 0);

  return (
    <div className="kpi-banner" role="group" aria-label="探索結果サマリー">
      <div className="kpi-card">
        <span className="kpi-card__label">候補数</span>
        <span className="kpi-card__value">{total}</span>
      </div>
      <div className="kpi-card" data-tone="GO">
        <span className="kpi-card__label">GO</span>
        <span className="kpi-card__value">{go}</span>
      </div>
      <div className="kpi-card" data-tone="WARN">
        <span className="kpi-card__label">条件付き</span>
        <span className="kpi-card__value">{cond}</span>
      </div>
      <div className="kpi-card" data-tone="FAIL">
        <span className="kpi-card__label">NO-GO</span>
        <span className="kpi-card__value">{noGo}</span>
      </div>
      <div className="kpi-card" data-tone="ACCENT">
        <span className="kpi-card__label">最高スコア</span>
        <span className="kpi-card__value">
          {topScore}
          <span className="kpi-card__suffix">点</span>
        </span>
      </div>
    </div>
  );
}

export function DiscoveryDashboard() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [discoverData, setDiscoverData] = useState<DiscoveryResponse | null>(null);
  const [selectedAsin, setSelectedAsin] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [isDiscovering, startDiscoverTransition] = useTransition();
  const [isAnalyzing, startAnalyzeTransition] = useTransition();
  const [viewMode, setViewMode] = useState<"discover" | "detail">("discover");

  const deferredFilterText = useDeferredValue(filterText);

  const filteredCandidates = useMemo(() => {
    if (!discoverData) return [];
    const query = deferredFilterText.trim().toLowerCase();
    if (!query) return discoverData.candidates;
    return discoverData.candidates.filter((candidate) =>
      `${candidate.title} ${candidate.brand} ${candidate.asin}`.toLowerCase().includes(query)
    );
  }, [deferredFilterText, discoverData]);

  async function requestAnalysis(candidate: DiscoveryCandidate): Promise<void> {
    setError(null);
    setAnalysisLoading(true);
    setSelectedAsin(candidate.asin);
    setViewMode("detail");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin: candidate.asin,
          title: candidate.title,
          category: candidate.category,
          brand: candidate.brand
        })
      });

      if (!response.ok) {
        setError("商品分析の取得に失敗しました。");
        setAnalysisLoading(false);
        return;
      }

      const data = (await response.json()) as AnalysisResult;
      startAnalyzeTransition(() => {
        setAnalysis(data);
        setAnalysisLoading(false);
      });
    } catch {
      setError("商品分析の取得に失敗しました。");
      setAnalysisLoading(false);
    }
  }

  function backToDiscover(): void {
    setViewMode("discover");
  }

  async function handleDiscover(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setDiscoverLoading(true);
    try {
      const response = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          minPrice: toNumber(form.minPrice),
          maxPrice: toNumber(form.maxPrice),
          maxReviews: toNumber(form.maxReviews),
          limit: toNumber(form.limit)
        })
      });

      if (!response.ok) {
        setError("商品探索に失敗しました。");
        setDiscoverLoading(false);
        return;
      }

      const data = (await response.json()) as DiscoveryResponse;
      startDiscoverTransition(() => {
        setDiscoverData(data);
        setSelectedAsin(null);
        setAnalysis(null);
        setDiscoverLoading(false);
        setViewMode("discover");
      });
    } catch {
      setError("商品探索に失敗しました。");
      setDiscoverLoading(false);
    }
  }

  const activeCandidate =
    filteredCandidates.find((candidate) => candidate.asin === selectedAsin) ?? filteredCandidates[0] ?? null;

  return (
    <main className="page-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-mark">APDE</span>
          <span className="eyebrow">Decision First</span>
        </div>
        <p className="app-tagline">
          カテゴリ起点で発掘し、利益が残るかまで判断する。
        </p>
      </header>

      {viewMode === "discover" ? (
        <section className="stage stage--discover">
          <div className="discover-controls">
            <div className="discover-controls__head">
              <h2>商品探索</h2>
              <p className="subtext">
                カテゴリと条件を入力すると、関連する候補商品が一覧表示されます。
              </p>
            </div>
            <form className="form-grid" onSubmit={(event) => void handleDiscover(event)}>
              <div className="field field--category">
                <label htmlFor="category">カテゴリ</label>
                <input
                  id="category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder="例: デスク周り"
                />
              </div>
              <details className="form-advanced">
                <summary>
                  詳細フィルタ
                  <span className="form-advanced__chip">
                    ¥{form.minPrice || "—"}〜¥{form.maxPrice || "—"} / レビュー≤
                    {form.maxReviews || "—"} / {form.limit || "—"}件
                  </span>
                </summary>
                <div className="form-advanced__grid">
                  <div className="field">
                    <label htmlFor="min-price">最低価格</label>
                    <input
                      id="min-price"
                      inputMode="numeric"
                      value={form.minPrice}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, minPrice: event.target.value }))
                      }
                      placeholder="3000"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="max-price">最高価格</label>
                    <input
                      id="max-price"
                      inputMode="numeric"
                      value={form.maxPrice}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, maxPrice: event.target.value }))
                      }
                      placeholder="8000"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="max-reviews">レビュー上限</label>
                    <input
                      id="max-reviews"
                      inputMode="numeric"
                      value={form.maxReviews}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, maxReviews: event.target.value }))
                      }
                      placeholder="500"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="limit">取得件数</label>
                    <input
                      id="limit"
                      inputMode="numeric"
                      value={form.limit}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, limit: event.target.value }))
                      }
                      placeholder="20"
                    />
                  </div>
                </div>
              </details>
              <div className="button-row">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={discoverLoading || !form.category.trim()}
                >
                  {discoverLoading ? "探索中..." : "候補を探索"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={discoverLoading || analysisLoading || isDiscovering || isAnalyzing}
                  onClick={() => {
                    setForm(initialForm);
                    setDiscoverData(null);
                    setAnalysis(null);
                    setSelectedAsin(null);
                    setFilterText("");
                    setError(null);
                    setDiscoverLoading(false);
                    setAnalysisLoading(false);
                    setViewMode("discover");
                  }}
                >
                  リセット
                </button>
              </div>
            </form>

            {error ? (
              <div className="error-banner" role="alert" aria-live="polite">
                {error}
              </div>
            ) : null}
          </div>

          {discoverData ? (
            <>
              <KpiBanner candidates={discoverData.candidates} />
              <div className="discover-toolbar">
                <div className="discover-toolbar__meta">
                  <span>
                    候補 <strong>{filteredCandidates.length}</strong> / {discoverData.candidates.length}件
                  </span>
                  <span>キーワード {discoverData.keywords.length}件生成</span>
                  <span>データソース {discoverData.source}</span>
                </div>
                <div className="field discover-toolbar__filter">
                  <label htmlFor="filter" className="visually-hidden">
                    候補の絞り込み
                  </label>
                  <input
                    id="filter"
                    value={filterText}
                    onChange={(event) => setFilterText(event.target.value)}
                    placeholder="商品名 / ブランド / ASIN で絞り込み"
                  />
                </div>
              </div>
            </>
          ) : null}

          {discoverLoading && !discoverData ? (
            <div className="candidate-grid" aria-busy="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="skeleton skeleton--card" aria-hidden="true" />
              ))}
            </div>
          ) : null}

          {discoverData ? (
            filteredCandidates.length > 0 ? (
              <div
                className="candidate-grid"
                aria-busy={discoverLoading || isDiscovering}
                aria-label="候補商品グリッド"
              >
                {filteredCandidates.map((candidate) => (
                  <button
                    key={candidate.asin}
                    className="candidate-card"
                    data-decision={candidate.decision}
                    type="button"
                    onClick={() => void requestAnalysis(candidate)}
                    disabled={analysisLoading}
                  >
                    <div className="candidate-card__head">
                      <span
                        className="decision-pill"
                        data-decision={candidate.decision}
                      >
                        {formatDecision(candidate.decision)}
                      </span>
                      <span className="candidate-card__score">
                        <strong>{candidate.score}</strong>
                        <span>/100</span>
                      </span>
                    </div>
                    <div className="candidate-card__title">{candidate.title}</div>
                    <div className="candidate-card__meta">
                      {candidate.brand} ・ {candidate.asin}
                    </div>
                    <div className="candidate-card__metrics">
                      <div>
                        <span>価格</span>
                        <strong>{formatCurrency(candidate.currentPrice)}</strong>
                      </div>
                      <div>
                        <span>月商想定</span>
                        <strong>{formatCurrency(candidate.monthlyRevenueEstimate)}</strong>
                      </div>
                      <div>
                        <span>粗利率</span>
                        <strong>{formatPercent(candidate.grossMarginRate)}</strong>
                      </div>
                    </div>
                    <div className="candidate-card__foot">
                      <span
                        className="competition-pill"
                        data-level={candidate.competitionLevel}
                      >
                        競争 {formatCompetition(candidate.competitionLevel)}
                      </span>
                      <span className="candidate-card__cta">
                        詳細を見る <span aria-hidden="true">→</span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state empty-state--grid">
                <p>絞り込み条件に該当する候補はありません。キーワードを変更してください。</p>
              </div>
            )
          ) : (
            !discoverLoading && (
              <div className="empty-state empty-state--grid">
                <h3>キーワードから探索を始めましょう</h3>
                <p className="subtext">
                  上のフォームにカテゴリを入力して「候補を探索」を押すと、
                  関連する候補商品がカード形式で並びます。
                </p>
              </div>
            )
          )}
        </section>
      ) : (
        <section className="stage stage--detail">
          <div className="detail-toolbar">
            <button
              className="back-button"
              type="button"
              onClick={backToDiscover}
            >
              <span aria-hidden="true">←</span> 候補一覧に戻る
            </button>
            {discoverData ? (
              <span className="detail-toolbar__breadcrumb">
                {discoverData.category}
                {analysis ? ` / ${analysis.brand}` : ""}
              </span>
            ) : null}
          </div>

          <div className="detail-panel">
            {analysis ? (
            <>
              <div className="detail-heading">
                <h2>{analysis.title}</h2>
                <a
                  className="amazon-link"
                  href={`https://www.amazon.co.jp/dp/${analysis.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Amazonで ${analysis.asin} を開く`}
                >
                  Amazonで開く <span aria-hidden="true">↗</span>
                </a>
              </div>
              <p className="subtext">
                {analysis.category} / {analysis.brand} / {analysis.asin}
                {analysisLoading ? " ・分析更新中..." : ""}
              </p>

              <div className="decision-summary" data-decision={analysis.decision}>
                <div className="decision-summary__score">
                  <span className="decision-summary__score-value">{analysis.score}</span>
                  <span className="decision-summary__score-max">/100</span>
                </div>
                <div className="decision-summary__main">
                  <span
                    className="decision-pill decision-pill--lg"
                    data-decision={analysis.decision}
                  >
                    {formatDecision(analysis.decision)}
                  </span>
                  <p className="decision-summary__headline">{analysis.summary}</p>
                </div>
                <div className="decision-summary__meta">
                  <div>
                    <span>競争</span>
                    <strong>{formatCompetition(analysis.competitionLevel)}</strong>
                  </div>
                  <div>
                    <span>月商想定</span>
                    <strong>{formatCurrency(analysis.monthlyRevenueEstimate)}</strong>
                  </div>
                </div>
              </div>

              <div className="detail-grid">
                <div className="detail-card">
                  <h3>主要理由</h3>
                  <ol className="detail-list">
                    {analysis.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ol>
                </div>
                <div className="detail-card">
                  <h3>主要リスク</h3>
                  <ol className="detail-list">
                    {analysis.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="score-bars">
                <ScoreBar label="価格適正" value={analysis.breakdown.priceFit} max={25} />
                <ScoreBar label="サイズ効率" value={analysis.breakdown.sizeEfficiency} max={20} />
                <ScoreBar label="競争余地" value={analysis.breakdown.competitionWindow} max={20} />
                <ScoreBar label="価格安定" value={analysis.breakdown.priceStability} max={15} />
                <ScoreBar label="OEM適性" value={analysis.breakdown.oemFeasibility} max={20} />
              </div>

              <ProfitCard metrics={analysis.metrics} />

              <div className="charts">
                <Sparkline
                  values={analysis.metrics.priceHistory}
                  title="価格推移"
                  formatValue={(value) => formatCurrency(Math.round(value))}
                />
                <Sparkline
                  values={analysis.metrics.bsrHistory}
                  title="BSR推移"
                  formatValue={(value) => Math.round(value).toLocaleString("ja-JP")}
                  unit="位"
                />
                <Sparkline
                  values={analysis.metrics.sellerCountHistory}
                  title="出品者推移"
                  formatValue={(value) => String(Math.round(value))}
                  unit="社"
                />
              </div>

              <div className="detail-grid" style={{ marginTop: 22 }}>
                <div className="detail-card">
                  <h3>データ要約</h3>
                  <ol className="detail-list">
                    <li>現価格 {formatCurrency(analysis.metrics.currentPrice)}</li>
                    <li>90日平均価格 {formatCurrency(analysis.metrics.averagePrice90d)}</li>
                    <li>推定月販 {analysis.metrics.estimatedMonthlySales.toLocaleString("ja-JP")}個</li>
                    <li>レビュー数 {analysis.metrics.reviewCount.toLocaleString("ja-JP")}件</li>
                    <li>重量 {analysis.metrics.weightGrams}g / サイズ {formatSizeTier(analysis.metrics.sizeTier)}</li>
                    <li>粗利率 {formatPercent(analysis.metrics.grossMarginRate)} / 想定CPC {formatCurrency(analysis.metrics.adCpcEstimate)}</li>
                  </ol>
                </div>
                <div className="detail-card">
                  <h3>次アクション</h3>
                  <ol className="detail-list">
                    {analysis.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="detail-card" style={{ marginBottom: 22 }}>
                <h3>構造ルール判定</h3>
                <div className="tag-row">
                  {analysis.ruleChecks.map((item) => (
                    <span className="rule-pill" data-status={item.status} key={item.key}>
                      {item.label}: {formatRuleStatus(item.status)}
                    </span>
                  ))}
                </div>
                <ol className="detail-list" style={{ marginTop: 12 }}>
                  {analysis.ruleChecks.map((item) => (
                    <li key={`${item.key}-detail`}>
                      {item.label}: {item.detail}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="insight-box">
                <h3>LLM分析</h3>
                <p>{analysis.insight.report}</p>
                <div className="tag-row" style={{ marginBottom: 12 }}>
                  {analysis.insight.differentiationIdeas.map((item) => (
                    <span className="tag" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
                <div className="tag-row">
                  {analysis.insight.qaSuggestions.map((item) => (
                    <span className="tag" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </>
            ) : analysisLoading ? (
              <SkeletonAnalysis />
            ) : (
              <div className="empty-state">
                <div>
                  <h2>詳細分析</h2>
                  <p className="subtext">
                    候補がまだ選ばれていません。一覧から商品をクリックして詳細を確認してください。
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
