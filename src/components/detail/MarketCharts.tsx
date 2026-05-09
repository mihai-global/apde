import { fmtNum, yen } from "@/lib/format";
import type { AsinMetrics, KeepaDerivedMetrics } from "@/lib/types";

function KeepaChart({
  title,
  valueLabel,
  values,
  color = "var(--fg-1)",
}: {
  title: string;
  valueLabel: string;
  values: number[];
  color?: string;
}) {
  const w = 480;
  const h = 120;
  if (values.length < 2) {
    return (
      <div className="kchart">
        <h4>{title}</h4>
        <div className="vbig num">{valueLabel}</div>
        <div className="muted">データ不足</div>
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 12) - 6}`)
    .join(" ");
  const area = `${pts} ${w},${h} 0,${h}`;
  return (
    <div className="kchart">
      <h4>{title}</h4>
      <div className="vbig num">{valueLabel}</div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ marginTop: 12 }}>
        <defs>
          <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.10" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#grad-${title})`} />
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="xax">
        <span>90日前</span>
        <span>60日前</span>
        <span>30日前</span>
        <span>今日</span>
      </div>
    </div>
  );
}

interface MarketChartsProps {
  metrics: AsinMetrics;
  derived: KeepaDerivedMetrics;
}

export function MarketCharts({ metrics, derived }: MarketChartsProps) {
  const priceValues = metrics.priceHistory.map((p) => p.value);
  const bsrValues = metrics.bsrHistory.map((p) => -p.value); // BSRは小さいほど良いのでマイナス反転
  const sellerValues = metrics.sellerCountHistory.map((p) => p.value);

  return (
    <section className="detail-section">
      <div className="section-head">
        <span className="num">04</span>
        <div className="ttl">市場データ (Keepa 90日)</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <KeepaChart
          title="価格"
          valueLabel={yen(priceValues.at(-1) ?? metrics.currentPrice)}
          values={priceValues}
        />
        <KeepaChart
          title="BSR"
          valueLabel={fmtNum(Math.abs(bsrValues.at(-1) ?? 0))}
          values={bsrValues}
          color="var(--action-blue)"
        />
        <KeepaChart
          title="出品者数"
          valueLabel={String(Math.round(sellerValues.at(-1) ?? metrics.sellerCount))}
          values={sellerValues}
        />
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        変動係数 (CV) = {derived.priceCv90d.toFixed(2)} ·
        セール期間比率 {Math.round(derived.saleRatio90d * 100)}% ·
        Buy Box 集中度 {Math.round(derived.buyBoxConcentration)}% ·
        90日下落率 {derived.priceDropRate90d.toFixed(1)}%
      </div>
    </section>
  );
}
