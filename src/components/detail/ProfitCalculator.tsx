"use client";

import { useMemo, useState } from "react";
import { MonthlySalesProvenance } from "@/components/primitives/MonthlySalesProvenance";
import { yen } from "@/lib/format";
import { computeProfit, PROFIT_DEFAULTS } from "@/lib/profit";
import type { AsinMetrics, ProfitBreakdown } from "@/lib/types";

interface ProfitCalculatorProps {
  metrics: AsinMetrics;
  initial: ProfitBreakdown;
}

export function ProfitCalculator({ metrics, initial }: ProfitCalculatorProps) {
  const [costRate, setCostRate] = useState<number>(initial.costRate ?? PROFIT_DEFAULTS.costRate);
  const [cvr, setCvr] = useState<number>(initial.cvr ?? PROFIT_DEFAULTS.cvr);
  const [cpc, setCpc] = useState<number>(initial.cpc ?? PROFIT_DEFAULTS.cpc);

  const profit = useMemo(() => computeProfit(metrics, { costRate, cvr, cpc }), [
    metrics,
    costRate,
    cvr,
    cpc,
  ]);

  const grossMarginPct = profit.sellingPrice ? (profit.grossProfit / profit.sellingPrice) * 100 : 0;

  return (
    <section className="detail-section">
      <div className="section-head">
        <span className="num">05</span>
        <div className="ttl">利益性計算</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 48 }}>
        <div className="prof">
          <div className="row">
            <div className="pl">想定販売価格</div>
            <div className="pr num">{yen(profit.sellingPrice)}</div>
          </div>
          <div className="row subtle">
            <div className="pl">Amazon販売手数料 (約10%)</div>
            <div className="pr num">−{yen(profit.amazonReferralFee)}</div>
          </div>
          <div className="row subtle">
            <div className="pl">FBA手数料 (推定 / 重量 {metrics.weightGrams}g)</div>
            <div className="pr num">−{yen(profit.fbaFee)}</div>
          </div>
          <div className="row subtle">
            <div className="pl">想定原価 (販売価格×{costRate}%)</div>
            <div className="pr num">−{yen(profit.cogs)}</div>
          </div>
          <div className="row subtle">
            <div className="pl">想定広告費 (CPC ¥{cpc} ÷ CVR {cvr}%)</div>
            <div className="pr num">−{yen(profit.adSpendPerUnit)}</div>
          </div>
          <div className="row total">
            <div className="pl">粗利 / 粗利率</div>
            <div className={`pr num ${grossMarginPct >= 30 ? "go" : "no"}`}>
              {yen(profit.grossProfit)} / {grossMarginPct.toFixed(1)}%
            </div>
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 16 }}>パラメータ調整</div>
          <div className="param-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="pf">
              <div className="label">原価率</div>
              <div className="val">
                {costRate}<span style={{ fontSize: 12, color: "var(--fg-4)", marginLeft: 4 }}>%</span>
              </div>
              <input type="range" min={15} max={60} value={costRate} onChange={(e) => setCostRate(Number(e.target.value))} />
            </div>
            <div className="pf">
              <div className="label">想定 CVR</div>
              <div className="val">
                {cvr}<span style={{ fontSize: 12, color: "var(--fg-4)", marginLeft: 4 }}>%</span>
              </div>
              <input type="range" min={3} max={25} value={cvr} onChange={(e) => setCvr(Number(e.target.value))} />
            </div>
            <div className="pf">
              <div className="label">想定 CPC</div>
              <div className="val">¥{cpc}</div>
              <input
                type="range"
                min={30}
                max={250}
                step={10}
                value={cpc}
                onChange={(e) => setCpc(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 12, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            <span>月想定 {metrics.estimatedMonthlySales.toLocaleString("ja-JP")} 個</span>
            <MonthlySalesProvenance source={metrics.monthlySalesSource} />
            <span style={{ marginLeft: 4 }}>
              → 月利 <strong style={{ color: "var(--fg-1)" }}>{yen(profit.netProfitMonthly)}</strong>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
