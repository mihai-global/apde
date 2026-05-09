import { DBadge } from "@/components/primitives/DBadge";
import type { AnalysisResult } from "@/lib/types";

interface DecisionPanelProps {
  analysis: AnalysisResult;
}

export function DecisionPanel({ analysis }: DecisionPanelProps) {
  return (
    <section className="detail-section">
      <div className="section-head">
        <span className="num">01</span>
        <div className="ttl">結論</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 32, marginBottom: 24 }}>
        <div>
          <DBadge decision={analysis.decision} size="lg" />
          <div
            style={{
              fontSize: 64,
              fontWeight: 300,
              letterSpacing: "-0.02em",
              marginTop: 16,
              lineHeight: 1,
              fontFeatureSettings: '"tnum" 1',
            }}
          >
            {analysis.score}
            <span style={{ fontSize: 18, color: "var(--fg-4)", marginLeft: 6 }}>/ 100</span>
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: 4 }}>
          <p style={{ fontSize: 17, lineHeight: 1.55, fontWeight: 300, margin: 0, color: "var(--fg-1)" }}>
            {analysis.summary}
          </p>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 32,
          paddingTop: 24,
          borderTop: "1px solid var(--border-1)",
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>主な根拠</div>
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.7, color: "var(--fg-2)" }}>
            {analysis.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>主な懸念</div>
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.7, color: "var(--fg-2)" }}>
            {analysis.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>事後アクション</div>
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.7, color: "var(--fg-2)" }}>
            {analysis.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
