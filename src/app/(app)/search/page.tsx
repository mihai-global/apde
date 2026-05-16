// /search: DB-driven 探索メイン画面 (R2)。
// 主動作は market_analysis テーブルから市場魅力度ランキングを取得して表示。
// 「新カテゴリ調査」ボタンでモーダルを開き、 Keepa /query を 1 コール叩いて
// 新しい候補を DB に追加する。 通常の閲覧では Keepa を呼ばない。
import Link from "next/link";
import { Crumbs } from "@/components/shell/Crumbs";
import { DiscoverButton } from "@/components/search/DiscoverButton";
import { ScoreSlider } from "@/components/search/ScoreSlider";
import {
  MarketCandidateListView,
  type MarketCandidateRow,
} from "@/components/list/MarketCandidateListView";
import { CATEGORIES } from "@/lib/keepa/categories";
import { listDiscoveryRuns, listMarketAnalysis } from "@/lib/supabase/repositories";

export const dynamic = "force-dynamic";
// runIngestDiscover server action が /search に POST されるため、
// ここの maxDuration がアクション実行時間の上限になる。
// Vercel Hobby の上限は 60s。 100 件並列 ingest で ~10-15s 掛かる想定。
export const maxDuration = 60;

/** 1 ページあたりの市場魅力度ランキング件数 (R7 で 200 → 50)。 */
const PAGE_SIZE = 50;

interface SearchPageProps {
  searchParams: Promise<{
    minPrice?: string;
    maxPrice?: string;
    maxReviews?: string;
    minScore?: string;
    decision?: string;
    category?: string;
    offset?: string;
  }>;
}

function parseInt32(value: string | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

/** 現在のフィルタ条件を保持しつつ、 offset だけ差し替えた querystring を作る。 */
function buildHref(params: {
  minPrice?: number;
  maxPrice?: number;
  maxReviews?: number;
  minScore?: number;
  decision?: "go" | "cond" | "no_go";
  category?: string;
  offset?: number;
}): string {
  const sp = new URLSearchParams();
  if (typeof params.minPrice === "number") sp.set("minPrice", String(params.minPrice));
  if (typeof params.maxPrice === "number") sp.set("maxPrice", String(params.maxPrice));
  if (typeof params.maxReviews === "number") sp.set("maxReviews", String(params.maxReviews));
  if (typeof params.minScore === "number") sp.set("minScore", String(params.minScore));
  if (params.decision) sp.set("decision", params.decision);
  if (params.category) sp.set("category", params.category);
  if (typeof params.offset === "number" && params.offset > 0) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const minPrice = parseInt32(params.minPrice);
  const maxPrice = parseInt32(params.maxPrice);
  const maxReviews = parseInt32(params.maxReviews);
  const minScore = parseInt32(params.minScore);
  const decision =
    params.decision === "go" || params.decision === "cond" || params.decision === "no_go"
      ? params.decision
      : undefined;
  const category = typeof params.category === "string" && params.category.trim() ? params.category.trim() : undefined;
  const offset = parseInt32(params.offset) ?? 0;

  const [marketRows, recentRuns] = await Promise.all([
    listMarketAnalysis({
      minPrice,
      maxPrice,
      maxReviews,
      minScore,
      decision,
      category,
      limit: PAGE_SIZE,
      offset,
    }),
    listDiscoveryRuns(3),
  ]);

  const rows: MarketCandidateRow[] = marketRows.map((r) => ({
    asin: r.asin,
    title: r.product?.title ?? r.asin,
    category: r.product?.category ?? "未分類",
    brand: r.product?.brand ?? null,
    imageUrl: r.product?.image_url ?? null,
    marketScore: r.market_score,
    decision: r.decision,
    axisDemand: r.axis_demand,
    axisCompetition: r.axis_competition,
    axisProfit: r.axis_profit,
    axisStability: r.axis_stability,
    axisDifferentiation: r.axis_differentiation,
    gatesPassed: r.gates_passed,
    gatesFailed: r.gates_failed,
    monthlySalesSource: r.monthly_sales_source,
    currentPriceYen: r.snapshot?.current_new_yen ?? r.snapshot?.current_amazon_yen ?? null,
    countReviews: r.snapshot?.count_reviews ?? null,
    monthlySold: r.snapshot?.monthly_sold ?? null,
    bsr: r.snapshot?.bsr ?? null,
    weightG: r.snapshot?.package_weight_g ?? null,
    fetchedAt: r.snapshot?.fetched_at ?? null,
  }));

  // ページング: 返ってきた件数が PAGE_SIZE と等しければ次ページが存在する可能性がある。
  const hasNext = rows.length >= PAGE_SIZE;
  const hasPrev = offset > 0;

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: 1360 }}>
        <Crumbs items={[{ label: "ダッシュボード", href: "/" }, { label: "探索" }]} />

        <div className="rowsplit" style={{ marginBottom: 24, alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">UC-01 · 市場魅力度ランキング</div>
            <h1 className="h1" style={{ marginTop: 8, marginBottom: 8 }}>探索</h1>
            <p
              className="muted"
              style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 720, margin: 0 }}
            >
              DB に蓄積された商品から、 5 軸 (需要・競争・利益・安定性・差別化) と 8 ゲートを合成した
              <strong> market_score </strong>順に表示します。 通常の閲覧では Keepa を呼ばないため、
              フィルタの切り替えは即時に反映されます。
            </p>
          </div>
          <DiscoverButton />
        </div>

        <FilterStrip
          minPrice={minPrice}
          maxPrice={maxPrice}
          maxReviews={maxReviews}
          minScore={minScore}
          decision={decision}
          category={category}
        />

        <MarketCandidateListView rows={rows} />

        {(hasPrev || hasNext) ? (
          <div
            className="cluster"
            style={{
              marginTop: 24,
              display: "flex",
              gap: 12,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {hasPrev ? (
              <Link
                href={buildHref({
                  minPrice,
                  maxPrice,
                  maxReviews,
                  minScore,
                  decision,
                  category,
                  offset: Math.max(offset - PAGE_SIZE, 0),
                })}
                className="pill"
              >
                <span className="arrow">‹</span> 前へ
              </Link>
            ) : null}
            <span className="muted" style={{ fontSize: 12 }}>
              {offset + 1}–{offset + rows.length} 件目
            </span>
            {hasNext ? (
              <Link
                href={buildHref({
                  minPrice,
                  maxPrice,
                  maxReviews,
                  minScore,
                  decision,
                  category,
                  offset: offset + PAGE_SIZE,
                })}
                className="pill solid"
              >
                もっと見る (+{PAGE_SIZE}) <span className="arrow">›</span>
              </Link>
            ) : null}
          </div>
        ) : null}

        {recentRuns.length > 0 ? (
          <section style={{ marginTop: 56 }}>
            <h2 className="h3" style={{ marginBottom: 12 }}>過去の探索ラン (旧形式)</h2>
            <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
              v1 で生成された discovery_runs スナップショットです (新規ラン作成は終了)。
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recentRuns.map((run) => (
                <li
                  key={run.id}
                  style={{
                    padding: "12px 0",
                    borderTop: "1px solid var(--border-1)",
                    display: "flex",
                    gap: 16,
                  }}
                >
                  <a href={`/search/${run.id}`} className="btn-text blue">
                    {run.category}
                  </a>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {run.candidate_count} 件 ·{" "}
                    {new Date(run.created_at).toLocaleString("ja-JP")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

interface FilterStripProps {
  minPrice?: number;
  maxPrice?: number;
  maxReviews?: number;
  minScore?: number;
  decision?: "go" | "cond" | "no_go";
  category?: string;
}

/**
 * URL パラメータ駆動のシンプルフィルタ。 GET フォームで送信し、 server component が再描画される。
 * R7 で カテゴリ drop-down と判定 drop-down をサーバサイド (URL params) に統一。
 * 送信時に offset は維持しない (新フィルタ適用時は先頭ページに戻す)。
 */
function FilterStrip(props: FilterStripProps) {
  return (
    <form
      method="get"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(0, 1fr)) auto",
        gap: 12,
        padding: 16,
        marginBottom: 24,
        border: "1px solid var(--border-1)",
        background: "var(--bg-1)",
      }}
    >
      <div>
        <label className="label" htmlFor="f-category">カテゴリ</label>
        <select
          id="f-category"
          name="category"
          className="select"
          defaultValue={props.category ?? ""}
        >
          <option value="">すべて</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.label}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-minPrice">価格 下限</label>
        <input
          id="f-minPrice"
          name="minPrice"
          className="input"
          type="number"
          defaultValue={props.minPrice ?? ""}
          placeholder="3000"
        />
      </div>
      <div>
        <label className="label" htmlFor="f-maxPrice">価格 上限</label>
        <input
          id="f-maxPrice"
          name="maxPrice"
          className="input"
          type="number"
          defaultValue={props.maxPrice ?? ""}
          placeholder="8000"
        />
      </div>
      <div>
        <label className="label" htmlFor="f-maxReviews">レビュー上限</label>
        <input
          id="f-maxReviews"
          name="maxReviews"
          className="input"
          type="number"
          defaultValue={props.maxReviews ?? ""}
          placeholder="500"
        />
      </div>
      <ScoreSlider name="minScore" defaultValue={props.minScore} />
      <div>
        <label className="label" htmlFor="f-decision">判定</label>
        <select
          id="f-decision"
          name="decision"
          className="select"
          defaultValue={props.decision ?? ""}
        >
          <option value="">すべて</option>
          <option value="go">GO</option>
          <option value="cond">条件付き</option>
          <option value="no_go">NO-GO</option>
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <button type="submit" className="pill solid">
          適用
        </button>
        <a href="/search" className="btn-ghost" style={{ alignSelf: "center" }}>
          リセット
        </a>
      </div>
    </form>
  );
}
