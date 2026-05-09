"use client";

import { useState } from "react";
import { Seg } from "@/components/primitives/Seg";
import type { GateResult } from "@/lib/types";

type View = "list" | "flow" | "matrix";

interface GateViewProps {
  gates: GateResult[];
}

function classOf(g: GateResult): "pass" | "warn" | "fail" {
  if (g.pass) return "pass";
  return g.severity === "CONDITIONAL_CAP" ? "warn" : "fail";
}

function severityLabel(g: GateResult): string {
  if (g.pass) return "合格";
  return g.severity === "CONDITIONAL_CAP" ? "条件付き上限" : "NO-GO";
}

export function GateView({ gates }: GateViewProps) {
  const [view, setView] = useState<View>("list");
  return (
    <section className="detail-section">
      <div className="section-head">
        <span className="num">03</span>
        <div className="ttl">ゲート判定</div>
        <div style={{ flex: 1 }} />
        <Seg<View>
          value={view}
          options={[
            { value: "list", label: "チェックリスト" },
            { value: "flow", label: "フロー" },
            { value: "matrix", label: "マトリクス" },
          ]}
          onChange={setView}
        />
      </div>
      {view === "list" ? <GateList gates={gates} /> : null}
      {view === "flow" ? <GateFlow gates={gates} /> : null}
      {view === "matrix" ? <GateMatrix gates={gates} /> : null}
    </section>
  );
}

function GateList({ gates }: { gates: GateResult[] }) {
  return (
    <div className="gate-list">
      {gates.map((g) => (
        <div key={g.key} className={`gate-row ${classOf(g)}`}>
          <span className="gate-icon">{g.pass ? "✓" : "✕"}</span>
          <div>
            <div className="gname">{g.name}</div>
            <div className="gsub">{g.threshold} · 実測 {g.observed}</div>
          </div>
          <span className="geffect">{severityLabel(g)}</span>
        </div>
      ))}
    </div>
  );
}

function GateFlow({ gates }: { gates: GateResult[] }) {
  return (
    <div className="gate-flow">
      {gates.map((g, i) => (
        <div key={g.key} className={`step ${classOf(g)}`}>
          <div className="stepnum">{String(i + 1).padStart(2, "0")}</div>
          <div className="stepbody">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <div className="gname">{g.name}</div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: g.pass ? "var(--decision-go)" : "var(--decision-no)",
                }}
              >
                {severityLabel(g)}
              </div>
            </div>
            <div className="gsub">{g.threshold} → {g.observed}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GateMatrix({ gates }: { gates: GateResult[] }) {
  return (
    <div className="gate-matrix">
      {gates.map((g) => (
        <div key={g.key} className={`gate-cell ${classOf(g)}`}>
          <span className="corner">{g.pass ? "PASS" : g.severity === "CONDITIONAL_CAP" ? "WARN" : "FAIL"}</span>
          <div className="gname">{g.name}</div>
          <div className="gval num">{g.observed}</div>
          <div className="gthresh">{g.threshold}</div>
        </div>
      ))}
    </div>
  );
}
