import { WatchlistManagementList, type ManagedWatchlistRow } from "@/components/watchlist/WatchlistManagementList";
import { Crumbs } from "@/components/shell/Crumbs";
import { listProductSummaries, listWatchlist } from "@/lib/supabase/repositories";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const watchlist = await listWatchlist();
  const productMap = new Map(
    (await listProductSummaries(watchlist.map((w) => w.asin))).map((p) => [p.asin, p]),
  );
  const rows: ManagedWatchlistRow[] = watchlist.map((w) => {
    const p = productMap.get(w.asin);
    return {
      asin: w.asin,
      title: p?.title ?? w.asin,
      brand: p?.brand ?? "—",
      status: w.status,
      decision: p?.decision ?? "CONDITIONAL_GO",
      score: p?.score ?? 0,
      seed: p?.seed ?? 1,
    };
  });

  return (
    <main className="page">
      <div className="shell">
        <Crumbs items={[{ label: "ダッシュボード", href: "/" }, { label: "監視リスト" }]} />
        <div className="rowsplit" style={{ marginBottom: 32 }}>
          <div>
            <div className="eyebrow">UC-05 · 監視 / 再評価</div>
            <h1 className="h1" style={{ marginTop: 8 }}>監視リスト</h1>
            <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
              GO / 条件付き GO 判定 + 仕入れ進行中の ASIN を一元管理。Cron 02:00 JST 再評価時に差分通知。
            </p>
          </div>
        </div>
        <WatchlistManagementList rows={rows} />
      </div>
    </main>
  );
}
