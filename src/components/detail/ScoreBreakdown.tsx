import { ScoreBar } from "@/components/primitives/ScoreBar";
import type { ScoreBreakdown as Breakdown } from "@/lib/types";

interface ScoreBreakdownProps {
  breakdown: Breakdown;
  total: number;
}

const AXES: Array<{ key: keyof Breakdown; name: string; max: number; hint: string }> = [
  { key: "priceFit", name: "価格適正", max: 25, hint: "個人物販で扱える価格帯か" },
  { key: "sizeEfficiency", name: "サイズ効率", max: 20, hint: "FBA手数料が利益を圧迫しないか" },
  { key: "competitionWindow", name: "競争余地", max: 20, hint: "後発で勝負になるか" },
  { key: "priceStability", name: "価格安定性", max: 15, hint: "価格崩壊リスクは低いか" },
  { key: "oemFeasibility", name: "OEM適性", max: 20, hint: "差別化と再現性は確保できるか" },
];

export function ScoreBreakdownSection({ breakdown, total }: ScoreBreakdownProps) {
  return (
    <section className="detail-section">
      <div className="section-head">
        <span className="num">02</span>
        <div className="ttl">スコア内訳</div>
        <div style={{ flex: 1 }} />
        <div className="muted" style={{ fontSize: 12 }}>合計 {total} / 100</div>
      </div>
      <table className="axis-tbl">
        <thead>
          <tr>
            <th>軸</th>
            <th>趣旨</th>
            <th style={{ width: 280 }}>スコア</th>
            <th className="r">配点</th>
          </tr>
        </thead>
        <tbody>
          {AXES.map((axis) => (
            <tr key={axis.key}>
              <td style={{ paddingRight: 16, width: 130 }}>
                <strong style={{ fontWeight: 400 }}>{axis.name}</strong>
              </td>
              <td style={{ color: "var(--fg-3)", fontSize: 12 }}>{axis.hint}</td>
              <td>
                <ScoreBar score={breakdown[axis.key]} max={axis.max} />
              </td>
              <td className="r num">
                <span style={{ color: "var(--fg-4)" }}>/ {axis.max}</span>
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>合計</td>
            <td />
            <td><ScoreBar score={total} max={100} /></td>
            <td className="r num">
              <span style={{ color: "var(--fg-4)" }}>/ 100</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
