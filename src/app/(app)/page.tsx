import Link from "next/link";
import { BudgetCard, type BudgetBreakdown } from "@/components/dashboard/BudgetCard";
import { KpiRow } from "@/components/dashboard/KpiRow";
import { RecentRunsTable } from "@/components/dashboard/RecentRunsTable";
import {
  WatchlistList,
  type WatchlistDisplayRow,
} from "@/components/dashboard/WatchlistList";
import { Chip } from "@/components/primitives/Chip";
import { env, mockMode } from "@/lib/env";
import {
  getAppSetting,
  getDashboardKpis,
  listApiUsageThisMonth,
  listDiscoveryRuns,
  listProductSummaries,
  listWatchlist,
} from "@/lib/supabase/repositories";
import { getServerSupabase } from "@/lib/supabase/server";

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

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 4) return "こんばんは";
  if (hour < 11) return "おはようございます";
  if (hour < 17) return "こんにちは";
  return "こんばんは";
}

function deriveDisplayName(email?: string | null, metadataName?: string | null): string {
  if (metadataName && metadataName.trim().length > 0) return metadataName.trim();
  if (email) {
    const local = email.split("@")[0] ?? "";
    if (local.length > 0) {
      // 「mihai.global.inc」→「Mihai.global.inc」のような最低限の見栄え
      return local.charAt(0).toUpperCase() + local.slice(1);
    }
  }
  return "ゲスト";
}

async function loadDisplayName(): Promise<string> {
  if (mockMode.supabase) return "ゲスト";
  const supabase = await getServerSupabase();
  if (!supabase) return "ゲスト";
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return deriveDisplayName(
    user?.email,
    typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
  );
}

function buildBudget(usage: Awaited<ReturnType<typeof listApiUsageThisMonth>>, budgetJpy: number): BudgetBreakdown {
  const totals = new Map<string, number>();
  for (const row of usage) {
    totals.set(row.provider, (totals.get(row.provider) ?? 0) + Number(row.cost_estimate ?? 0));
  }
  const used = Array.from(totals.values()).reduce((sum, v) => sum + v, 0);
  // 24h cache hit rate を粗く推定: (24h 内 keepa_data 更新数 - 24h 内 keepa /product 呼び出し数)
  // を見たいが、専用テーブルが無いため当面は計算不能。 callsLast24h のみ実値で出す。
  return {
    used,
    budget: budgetJpy,
    warningThresholdPct: 80,
    perProvider: Array.from(totals.entries()).map(([provider, cost]) => ({
      provider: PROVIDER_LABEL[provider] ?? provider,
      cost,
      tone: PROVIDER_TONE[provider] ?? "var(--fg-1)",
    })),
    callsLast24h: usage.filter((row) => Date.parse(row.occurred_at) >= Date.now() - 24 * 3600 * 1000)
      .length,
  };
}

export default async function DashboardPage() {
  const [watchlist, runs, usage, settingBudget, kpis, displayName] = await Promise.all([
    listWatchlist(),
    listDiscoveryRuns(3),
    listApiUsageThisMonth(),
    getAppSetting<number>("cost_budget_jpy"),
    getDashboardKpis(),
    loadDisplayName(),
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
  const greetingPhrase = greeting(today);

  // 実データから算出した KPI
  const goDelta = kpis.goThisMonth - kpis.goLastMonth;
  const goSub =
    goDelta === 0
      ? kpis.goThisMonth === 0
        ? "今月はまだ判定なし"
        : "先月と同じ"
      : goDelta > 0
        ? `先月比 +${goDelta}件`
        : `先月比 ${goDelta}件`;
  const profitabilityRate =
    kpis.feedbackTotal > 0
      ? Math.round((kpis.feedbackProfitable / kpis.feedbackTotal) * 100)
      : null;
  const sourcingPlusLive = kpis.watchlistSourcing + kpis.watchlistLive;
  const kpiCards = [
    {
      label: "GO 判定 (今月)",
      value: kpis.goThisMonth,
      unit: "件",
      sub: goSub,
      tone: "go" as const,
    },
    {
      label: "条件付き GO (今月)",
      value: kpis.conditionalThisMonth,
      unit: "件",
      sub: `監視中 ${kpis.watchlistTotal}件`,
      tone: "cond" as const,
    },
    {
      label: "仕入れ進行中",
      value: sourcingPlusLive,
      unit: "件",
      sub:
        profitabilityRate !== null
          ? `事後妥当性 ${profitabilityRate}% (${kpis.feedbackTotal}件)`
          : "フィードバック未登録",
    },
    {
      label: "探索ラン (週)",
      value: kpis.recentRunsCount,
      unit: "回",
      sub:
        kpis.avgDiscoveryDurationSec > 0
          ? `平均 ${kpis.avgDiscoveryDurationSec} 秒`
          : "履歴なし",
    },
  ];

  const watchlistChangeCount = kpis.watchlistChangedThisWeek;

  return (
    <main className="page">
      <div className="shell">
        <div className="rowsplit" style={{ marginBottom: 8 }}>
          <div>
            <div className="eyebrow">{formatDate(today)}</div>
            <h1 className="h1" style={{ marginTop: 8 }}>
              {greetingPhrase}、{displayName} さん
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
          {watchlistChangeCount > 0
            ? `今週の監視リスト追加: ${watchlistChangeCount}件。`
            : `監視リスト ${kpis.watchlistTotal}件が登録されています。`}
          {" "}今月のAPI予算は
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
