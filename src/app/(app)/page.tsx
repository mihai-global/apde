import Link from "next/link";
import { BudgetCard, type BudgetBreakdown } from "@/components/dashboard/BudgetCard";
import { KpiRow } from "@/components/dashboard/KpiRow";
import { RecentRunsTable } from "@/components/dashboard/RecentRunsTable";
import {
  WatchlistList,
  type WatchlistDisplayRow,
} from "@/components/dashboard/WatchlistList";
import { Chip } from "@/components/primitives/Chip";
import { env } from "@/lib/env";
import {
  getAppSetting,
  listApiUsageThisMonth,
  listDiscoveryRuns,
  listProductSummaries,
  listWatchlist,
} from "@/lib/supabase/repositories";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = {
  keepa: "Keepa",
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  spapi: "SP-API",
};

const PROVIDER_TONE: Record<string, string> = {
  keepa: "var(--fg-1)",
  gemini: "var(--gray-400)",
  spapi: "var(--gray-300)",
  openai: "var(--gray-500)",
  anthropic: "var(--gray-500)",
};

function formatDate(now: Date): string {
  return now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

function buildBudget(usage: Awaited<ReturnType<typeof listApiUsageThisMonth>>, budgetJpy: number): BudgetBreakdown {
  const totals = new Map<string, number>();
  for (const row of usage) {
    totals.set(row.provider, (totals.get(row.provider) ?? 0) + Number(row.cost_estimate ?? 0));
  }
  const used = Array.from(totals.values()).reduce((sum, v) => sum + v, 0);
  return {
    used,
    budget: budgetJpy,
    warningThresholdPct: 80,
    perProvider: Array.from(totals.entries()).map(([provider, cost]) => ({
      provider: PROVIDER_LABEL[provider] ?? provider,
      cost,
      tone: PROVIDER_TONE[provider] ?? "var(--fg-1)",
    })),
    cacheHitRate: 83,
    callsLast24h: usage.filter((row) => Date.parse(row.occurred_at) >= Date.now() - 24 * 3600 * 1000)
      .length,
  };
}

export default async function DashboardPage() {
  const [watchlist, runs, usage, settingBudget] = await Promise.all([
    listWatchlist(),
    listDiscoveryRuns(3),
    listApiUsageThisMonth(),
    getAppSetting<number>("cost_budget_jpy"),
  ]);
  const productMap = new Map(
    (await listProductSummaries(watchlist.map((w) => w.asin))).map((p) => [p.asin, p]),
  );
  const watchlistTop: WatchlistDisplayRow[] = watchlist.slice(0, 5).map((row, i) => {
    const product = productMap.get(row.asin);
    return {
      asin: row.asin,
      title: product?.title ?? row.asin,
      brand: product?.brand ?? "—",
      status: row.status,
      decision: product?.decision ?? "CONDITIONAL_GO",
      score: product?.score ?? 0,
      delta: i % 2 === 0 ? 2 : -1,
      seed: product?.seed ?? 1,
      imageUrl: product?.imageUrl,
    };
  });

  const budget = buildBudget(usage, settingBudget ?? env.costBudgetJpy);
  const today = new Date();

  // KPIs (mockMode は固定値、本番は analysis テーブル集計に差し替えやすい構造)
  const kpiCards = [
    { label: "GO 判定 (今月)", value: 7, unit: "件", sub: "先月比 +2件", tone: "go" as const },
    { label: "条件付き GO", value: 12, unit: "件", sub: "監視中 9件", tone: "cond" as const },
    { label: "仕入れ実行", value: 3, unit: "件", sub: "事後妥当性 67%" },
    { label: "分析時間 (平均)", value: 52, unit: "秒", sub: "目標 1分以下を達成" },
  ];

  // 監視中の決定変化サマリ (mockMode 用)
  const watchlistChangeCount = 3;

  return (
    <main className="page">
      <div className="shell">
        <div className="rowsplit" style={{ marginBottom: 8 }}>
          <div>
            <div className="eyebrow">{formatDate(today)}</div>
            <h1 className="h1" style={{ marginTop: 8 }}>
              おはようございます、Yuki さん
            </h1>
          </div>
          <div className="cluster">
            <button type="button" className="pill sm" disabled>
              CSVエクスポート
            </button>
            <Link href="/search" className="pill sm solid brand">
              新しい探索を開始 <span className="arrow">›</span>
            </Link>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 56, fontSize: 14 }}>
          監視中{watchlistChangeCount}件にスコア変化。今月のAPI予算は
          {budget.budget > 0 ? Math.round((budget.used / budget.budget) * 100) : 0}%消化中。
        </p>

        <div style={{ marginBottom: 64 }}>
          <KpiRow cards={kpiCards} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 48 }}>
          <section>
            <div className="rowsplit" style={{ marginBottom: 24 }}>
              <div className="eyebrow">API利用コスト (今月)</div>
              <Link href="/dictionary" className="btn-text" style={{ fontSize: 12 }}>
                履歴 ›
              </Link>
            </div>
            <BudgetCard data={budget} />
          </section>

          <section>
            <div className="rowsplit" style={{ marginBottom: 24 }}>
              <div className="eyebrow">監視リスト · Cron 02:00 JST 再評価</div>
              <div className="cluster">
                <Chip active>candidate</Chip>
                <Chip>sourcing</Chip>
                <Chip>live</Chip>
              </div>
            </div>
            <WatchlistList rows={watchlistTop} />
            <Link href="/watchlist" className="btn-text blue" style={{ marginTop: 20, display: "inline-block" }}>
              監視リスト全件 ({watchlist.length}件) ›
            </Link>
          </section>
        </div>

        <section className="sectiongap">
          <div className="rowsplit" style={{ marginBottom: 24 }}>
            <div className="eyebrow">最近の探索ラン</div>
          </div>
          <RecentRunsTable runs={runs.map((run) => ({ ...run, go_count: Math.round(run.candidate_count * 0.18) }))} />
        </section>
      </div>
    </main>
  );
}
