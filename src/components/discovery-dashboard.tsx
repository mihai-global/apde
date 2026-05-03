"use client";

import type { FormEvent } from "react";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { AnalysisResult, DiscoveryCandidate, DiscoveryResponse } from "@/lib/types";

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
  title
}: {
  values: Array<{ timestamp: string; value: number }>;
  title: string;
}) {
  const heights = useMemo(() => {
    const numbers = values.map((item) => item.value);
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const range = Math.max(max - min, 1);
    return numbers.map((value) => 24 + ((value - min) / range) * 96);
  }, [values]);

  return (
    <div className="chart-card">
      <strong>{title}</strong>
      <div className="sparkline" aria-hidden="true">
        {heights.map((height, index) => (
          <div
            key={`${title}-${values[index]?.timestamp ?? index}`}
            className="sparkline-bar"
            style={{ height }}
          />
        ))}
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
        setSelectedAsin(candidate.asin);
        setAnalysis(data);
        setAnalysisLoading(false);
      });
    } catch {
      setError("商品分析の取得に失敗しました。");
      setAnalysisLoading(false);
    }
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
        setSelectedAsin(data.candidates[0]?.asin ?? null);
        setAnalysis(null);
        setDiscoverLoading(false);
      });

      if (data.candidates[0]) {
        void requestAnalysis(data.candidates[0]);
      }
    } catch {
      setError("商品探索に失敗しました。");
      setDiscoverLoading(false);
    }
  }

  const activeCandidate =
    filteredCandidates.find((candidate) => candidate.asin === selectedAsin) ?? filteredCandidates[0] ?? null;

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <span className="eyebrow">Decision First</span>
          <h1>Amazon Product Discovery Engine</h1>
          <p>
            カテゴリを起点に候補商品を自動抽出し、Keepa系指標と戦略コメントをまとめて参入判断まで落とし込むMVPです。
            非エンジニアでも、探索からGO / NO-GO判断までを1画面で進められます。
          </p>
        </div>
        <div className="hero-stat-grid">
          <div className="metric-card">
            <span className="metric-label">探索対象</span>
            <span className="metric-value">10-100件</span>
            <div className="metric-note">カテゴリとフィルタ条件から候補を一覧化します。</div>
          </div>
          <div className="metric-card">
            <span className="metric-label">判定ロジック</span>
            <span className="metric-value">5軸 + ゲート</span>
            <div className="metric-note">価格、サイズ、競争、価格安定、OEM適性に、粗利や広告耐性の落選条件を重ねます。</div>
          </div>
          <div className="metric-card">
            <span className="metric-label">キャッシュ</span>
            <span className="metric-value">24h</span>
            <div className="metric-note">同一条件・同一ASINの再分析を抑制します。</div>
          </div>
          <div className="metric-card">
            <span className="metric-label">MVP範囲</span>
            <span className="metric-value">探索 + 詳細分析</span>
            <div className="metric-note">将来的にSupabase Auth、Cron、実API接続へ拡張できます。</div>
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="panel">
          <h2>商品探索</h2>
          <p className="subtext">カテゴリと条件を入力すると、候補商品の一覧と優先順位が返ります。</p>
          <form className="form-grid" onSubmit={(event) => void handleDiscover(event)}>
            <div className="field">
              <label htmlFor="category">カテゴリ</label>
              <input
                id="category"
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                placeholder="例: デスク周り"
              />
            </div>
            <div className="field">
              <label htmlFor="min-price">最低価格</label>
              <input
                id="min-price"
                inputMode="numeric"
                value={form.minPrice}
                onChange={(event) => setForm((current) => ({ ...current, minPrice: event.target.value }))}
                placeholder="3000"
              />
            </div>
            <div className="field">
              <label htmlFor="max-price">最高価格</label>
              <input
                id="max-price"
                inputMode="numeric"
                value={form.maxPrice}
                onChange={(event) => setForm((current) => ({ ...current, maxPrice: event.target.value }))}
                placeholder="8000"
              />
            </div>
            <div className="field">
              <label htmlFor="max-reviews">レビュー上限</label>
              <input
                id="max-reviews"
                inputMode="numeric"
                value={form.maxReviews}
                onChange={(event) => setForm((current) => ({ ...current, maxReviews: event.target.value }))}
                placeholder="500"
              />
            </div>
            <div className="field">
              <label htmlFor="limit">取得件数</label>
              <input
                id="limit"
                inputMode="numeric"
                value={form.limit}
                onChange={(event) => setForm((current) => ({ ...current, limit: event.target.value }))}
                placeholder="20"
              />
            </div>
            <div className="button-row">
              <button className="primary-button" type="submit" disabled={discoverLoading || !form.category.trim()}>
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
                }}
              >
                リセット
              </button>
            </div>
          </form>

          <div className="status-line">
            <span>{discoverData ? `候補数 ${discoverData.candidates.length}件` : "未探索"}</span>
            {discoverData ? <span>検索語 {discoverData.keywords.length}件生成</span> : null}
            {discoverData?.source ? <span>データソース {discoverData.source}</span> : null}
            <span>推奨価格帯 ¥3,000〜¥8,000</span>
          </div>

          <div className="field">
            <label htmlFor="filter">候補の絞り込み</label>
            <input
              id="filter"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="商品名 / ブランド / ASIN"
            />
          </div>

          {error ? <p className="subtext">{error}</p> : null}

          <div className="candidate-list">
            {filteredCandidates.map((candidate) => (
              <button
                key={candidate.asin}
                className="candidate-button"
                data-active={String(candidate.asin === activeCandidate?.asin)}
                type="button"
                onClick={() => void requestAnalysis(candidate)}
                disabled={analysisLoading}
              >
                <div className="candidate-top">
                  <div>
                    <div className="candidate-title">{candidate.title}</div>
                    <div className="candidate-meta">
                      <span>{candidate.brand}</span>
                      <span>{candidate.asin}</span>
                    </div>
                  </div>
                  <span className="score-pill">{candidate.score}点</span>
                </div>
                <div className="inline-metrics">
                  <span>{formatCurrency(candidate.currentPrice)}</span>
                  <span>月商想定 {formatCurrency(candidate.monthlyRevenueEstimate)}</span>
                  <span>レビュー {candidate.reviewCount}</span>
                  <span>出品者 {candidate.sellerCount}</span>
                  <span>重量 {candidate.weightGrams}g</span>
                  <span>粗利率 {formatPercent(candidate.grossMarginRate)}</span>
                </div>
                <div className="button-row" style={{ marginTop: 10 }}>
                  <span className="decision-pill" data-decision={candidate.decision}>
                    {formatDecision(candidate.decision)}
                  </span>
                  <span className="competition-pill" data-level={candidate.competitionLevel}>
                    競争 {formatCompetition(candidate.competitionLevel)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="detail-panel">
          {analysis ? (
            <>
              <h2>{analysis.title}</h2>
              <p className="subtext">
                {analysis.category} / {analysis.brand} / {analysis.asin}
              </p>

              <div className="status-line">
                <span className="score-pill">{analysis.score}点</span>
                <span className="decision-pill" data-decision={analysis.decision}>
                  {formatDecision(analysis.decision)}
                </span>
                <span className="competition-pill" data-level={analysis.competitionLevel}>
                  競争 {formatCompetition(analysis.competitionLevel)}
                </span>
                <span>月商想定 {formatCurrency(analysis.monthlyRevenueEstimate)}</span>
                {analysisLoading ? <span>分析更新中...</span> : null}
              </div>

              <div className="detail-grid">
                <div className="detail-card">
                  <h3>結論</h3>
                  <p>{analysis.summary}</p>
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

              <div className="breakdown-grid">
                <div className="breakdown-card">
                  価格適正
                  <strong>{analysis.breakdown.priceFit} / 25</strong>
                </div>
                <div className="breakdown-card">
                  サイズ効率
                  <strong>{analysis.breakdown.sizeEfficiency} / 20</strong>
                </div>
                <div className="breakdown-card">
                  競争余地
                  <strong>{analysis.breakdown.competitionWindow} / 20</strong>
                </div>
                <div className="breakdown-card">
                  価格安定 + OEM
                  <strong>{analysis.breakdown.priceStability + analysis.breakdown.oemFeasibility} / 35</strong>
                </div>
              </div>

              <div className="charts">
                <Sparkline values={analysis.metrics.priceHistory} title="価格推移" />
                <Sparkline values={analysis.metrics.bsrHistory} title="BSR推移" />
                <Sparkline values={analysis.metrics.sellerCountHistory} title="出品者推移" />
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
                    <span className="tag" key={item.key}>
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
          ) : (
            <div className="empty-state">
              <div>
                <h2>詳細分析</h2>
                <p className="subtext">
                  左側でカテゴリ探索を実行すると、選択した商品のGO / NO-GO判断と理由がここに表示されます。
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
