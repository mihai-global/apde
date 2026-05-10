import { addToWatchlist, askLlm } from "@/app/(app)/products/[asin]/actions";
import { AsideDecisionCard } from "@/components/detail/AsideDecisionCard";
import { DecisionPanel } from "@/components/detail/DecisionPanel";
import { GateView } from "@/components/detail/GateView";
import { HistoryTable } from "@/components/detail/HistoryTable";
import { KeepaSyncPanel } from "@/components/detail/KeepaSyncPanel";
import { LlmReportTabs } from "@/components/detail/LlmReportTabs";
import { MarketCharts } from "@/components/detail/MarketCharts";
import { MemoEditor } from "@/components/detail/MemoEditor";
import { ProfitCalculator } from "@/components/detail/ProfitCalculator";
import { ScoreBreakdownSection } from "@/components/detail/ScoreBreakdown";
import { SourceBadge } from "@/components/primitives/SourceBadge";
import { Thumbnail } from "@/components/primitives/Thumbnail";
import { Crumbs } from "@/components/shell/Crumbs";
import { fmtNum } from "@/lib/format";
import { analyzeProduct } from "@/lib/integrations";
import {
  getProductRefreshMeta,
  getProductSummary,
  listAnalysisHistory,
  listBsrHistory,
  listPriceHistory,
  listThreads,
  listWatchlist,
} from "@/lib/supabase/repositories";

export const dynamic = "force-dynamic";

function asinSeed(asin: string): number {
  let acc = 0;
  for (const ch of asin) acc = (acc * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(acc);
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ asin: string }>;
}) {
  const { asin } = await params;
  const [product, history, threads, watchlist, refreshMeta, priceHistory, bsrHistory] = await Promise.all([
    getProductSummary(asin),
    listAnalysisHistory(asin, 5),
    listThreads(asin),
    listWatchlist(),
    getProductRefreshMeta(asin),
    listPriceHistory(asin, "new", 200),
    listBsrHistory(asin, 200),
  ]);

  // products テーブルから取得した実データ (Keepa enrichment 済) を override として渡す。
  // これにより cache hit でも detail ページで実 weight / review / seller / rating が反映される。
  const productOverrides: Partial<import("@/lib/types").AsinMetrics> = {};
  if (product) {
    if (product.imageUrl) productOverrides.imageUrl = product.imageUrl;
    if (product.weight_grams > 0) {
      productOverrides.weightGrams = product.weight_grams;
      productOverrides.sizeTier =
        product.weight_grams > 1000 ? "OVERSIZE" : product.weight_grams <= 500 ? "SMALL_STANDARD" : "LARGE_STANDARD";
    }
    if (product.review_count > 0) productOverrides.reviewCount = product.review_count;
    if (product.seller_count > 0) productOverrides.sellerCount = product.seller_count;
    if (product.rating != null && product.rating > 0) productOverrides.rating = product.rating;
    if (product.current_price > 0) productOverrides.currentPrice = product.current_price;
  }
  const analysis = await analyzeProduct({
    asin,
    title: product?.title,
    category: product?.category,
    brand: product?.brand,
    metrics: Object.keys(productOverrides).length > 0 ? productOverrides : undefined,
  });

  const watchlistStatus = watchlist.find((w) => w.asin === asin)?.status ?? null;
  const thumbSeed = asinSeed(asin);

  async function handleAsk(prompt: string) {
    "use server";
    await askLlm(asin, prompt);
  }
  async function handleAddToWatchlist(status: import("@/lib/types").WatchlistStatus) {
    "use server";
    await addToWatchlist(asin, status);
  }

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: 1360 }}>
        <Crumbs
          items={[
            { label: "ダッシュボード", href: "/" },
            { label: analysis.category, href: "/search" },
            { label: analysis.asin },
          ]}
        />

        <div
          className="rowsplit"
          style={{ alignItems: "flex-start", marginBottom: 40, gap: 32 }}
        >
          <div style={{ flex: 1, display: "flex", gap: 24 }}>
            <Thumbnail
              src={analysis.metrics.imageUrl ?? product?.imageUrl}
              alt={analysis.title}
              seed={thumbSeed}
              size={96}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span>{analysis.category} · ASIN {analysis.asin}</span>
                <SourceBadge source={analysis.source} detail={`LLM: ${analysis.insight.model}`} />
              </div>
              <h1 className="h1" style={{ marginTop: 8, fontSize: 28 }}>
                {analysis.title}
              </h1>
              <div className="cluster" style={{ marginTop: 12, gap: 16 }}>
                <span className="muted" style={{ fontSize: 13 }}>{analysis.brand}</span>
                <span className="muted" style={{ fontSize: 13 }}>·</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  レビュー {fmtNum(analysis.metrics.reviewCount)}件
                  {analysis.metrics.rating ? ` ★${analysis.metrics.rating}` : ""}
                </span>
                <span className="muted" style={{ fontSize: 13 }}>·</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  出品者 {analysis.metrics.sellerCount} / 重量 {analysis.metrics.weightGrams}g
                </span>
              </div>
            </div>
          </div>
          <div className="cluster" style={{ flexShrink: 0 }}>
            <a
              className="pill sm"
              href={`https://www.amazon.co.jp/dp/${analysis.asin}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Amazonで開く
            </a>
            <button type="button" className="pill sm solid">
              最新を取得 <span className="arrow">›</span>
            </button>
          </div>
        </div>

        <div className="detail-grid">
          <div>
            <DecisionPanel analysis={analysis} />
            <KeepaSyncPanel
              asin={asin}
              tier={refreshMeta?.tier ?? 3}
              lastFullAt={refreshMeta?.keepa_last_full_at ?? null}
              lastDiffAt={refreshMeta?.keepa_last_diff_at ?? null}
              priceHistory={priceHistory.map((p) => ({ ts: p.ts, price_yen: p.price_yen }))}
              bsrHistory={bsrHistory.map((b) => ({ ts: b.ts, rank: b.rank }))}
            />
            <ScoreBreakdownSection breakdown={analysis.breakdown} total={analysis.score} />
            <GateView gates={analysis.gates} />
            <MarketCharts metrics={analysis.metrics} derived={analysis.derived} />
            <ProfitCalculator metrics={analysis.metrics} initial={analysis.profit} />
            <LlmReportTabs
              insight={analysis.insight}
              asin={analysis.asin}
              threads={threads}
              onAsk={handleAsk}
            />
            <HistoryTable rows={history} />
            <MemoEditor asin={analysis.asin} />
          </div>
          <AsideDecisionCard
            analysis={analysis}
            initialStatus={watchlistStatus}
            onAddToWatchlist={handleAddToWatchlist}
          />
        </div>
      </div>
    </main>
  );
}
