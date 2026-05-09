import { yen } from "@/lib/format";

export interface BudgetBreakdown {
  used: number;
  budget: number;
  warningThresholdPct: number; // 0-100
  perProvider: Array<{ provider: string; cost: number; tone?: string }>;
  cacheHitRate?: number; // 0-100
  callsLast24h?: number;
}

export function BudgetCard({ data }: { data: BudgetBreakdown }) {
  const usedPct = data.budget > 0 ? Math.min(100, (data.used / data.budget) * 100) : 0;
  // Phase 1 UI/UX 改善: 3-segment thresholds — success(0-50) / warning(50-warningThreshold) / danger(over warningThreshold)
  const warnT = data.warningThresholdPct; // e.g. 80
  const segSuccess = 50;
  const segWarning = Math.max(segSuccess, warnT); // 80
  const successWidth = segSuccess; // 0-50
  const warningWidth = segWarning - segSuccess; // 50-80
  const dangerWidth = 100 - segWarning; // 80-100
  const activeTone =
    usedPct < segSuccess ? "success" : usedPct < segWarning ? "warning" : "danger";
  return (
    <div className="budget-card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 36, fontWeight: 300, fontFeatureSettings: '"tnum" 1' }}>
          {yen(data.used)}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          / {yen(data.budget)} 月予算
        </div>
      </div>
      <div
        className="budget-bar seg"
        role="progressbar"
        aria-valuenow={Math.round(usedPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`月予算消化 ${Math.round(usedPct)}%（警告閾値 ${warnT}%）`}
      >
        <span
          className={`seg-fill tone-success${activeTone === "success" ? " active" : ""}`}
          style={{ width: `${successWidth}%` }}
        />
        <span
          className={`seg-fill tone-warning${activeTone === "warning" ? " active" : ""}`}
          style={{ width: `${warningWidth}%` }}
        />
        <span
          className={`seg-fill tone-danger${activeTone === "danger" ? " active" : ""}`}
          style={{ width: `${dangerWidth}%` }}
        />
        <span
          className="threshold"
          style={{ left: `${warnT}%` }}
          title={`${warnT}% 警告閾値`}
        />
        <span
          className="marker"
          style={{ left: `calc(${usedPct}% - 1px)` }}
          title={`現在 ${Math.round(usedPct)}%`}
        />
      </div>
      <div
        className="rowsplit"
        style={{ fontSize: 11, color: "var(--fg-4)", letterSpacing: "0.08em" }}
      >
        <span>0</span>
        <span>警告 {warnT}%</span>
        <span>{yen(data.budget)}</span>
      </div>
      <div className="legend">
        {data.perProvider.map((row) => (
          <span key={row.provider}>
            <span className="sw" style={{ background: row.tone ?? "var(--fg-1)" }} />
            {row.provider} {yen(row.cost)}
          </span>
        ))}
      </div>
      {data.cacheHitRate !== undefined || data.callsLast24h !== undefined ? (
        <div
          style={{
            marginTop: 24,
            fontSize: 12,
            color: "var(--fg-3)",
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 12,
          }}
        >
          {data.cacheHitRate !== undefined ? (
            <div className="rowsplit">
              <span>キャッシュヒット率 (再評価時)</span>
              <span className="num" style={{ color: "var(--fg-1)" }}>
                {data.cacheHitRate}%
              </span>
            </div>
          ) : null}
          {data.callsLast24h !== undefined ? (
            <div className="rowsplit">
              <span>API呼び出し / 24時間</span>
              <span className="num" style={{ color: "var(--fg-1)" }}>
                {data.callsLast24h}回
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
