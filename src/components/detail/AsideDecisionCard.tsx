"use client";

import { useState, useTransition } from "react";
import { DBadge } from "@/components/primitives/DBadge";
import type { AnalysisResult, WatchlistStatus } from "@/lib/types";

interface AsideDecisionCardProps {
  analysis: AnalysisResult;
  initialStatus: WatchlistStatus | null;
  onAddToWatchlist: (status: WatchlistStatus) => Promise<void>;
}

export function AsideDecisionCard({ analysis, initialStatus, onAddToWatchlist }: AsideDecisionCardProps) {
  const [status, setStatus] = useState<WatchlistStatus | null>(initialStatus);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    startTransition(async () => {
      await onAddToWatchlist("candidate");
      setStatus("candidate");
    });
  }

  return (
    <aside>
      <div className="aside-card">
        <div className="ds-eye">最終判定</div>
        <DBadge decision={analysis.decision} size="lg" />
        <div className="ds-score num">
          {analysis.score}
          <span className="of">/ 100</span>
        </div>
        <div style={{ borderTop: "1px solid var(--border-1)", marginTop: 20 }}>
          <div className="ds-eye" style={{ marginTop: 24, marginBottom: 8 }}>主な根拠</div>
          <ul className="reason-list">
            {analysis.reasons.map((reason, i) => (
              <li key={i}>
                <span className="marker">{String(i + 1).padStart(2, "0")}</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          <div className="ds-eye" style={{ marginTop: 24, marginBottom: 8 }}>主なリスク</div>
          <ul className="reason-list">
            {analysis.risks.map((risk, i) => (
              <li key={i}>
                <span className="marker">!</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="actions">
          <button
            className="pill solid"
            type="button"
            onClick={handleAdd}
            disabled={pending || status !== null}
          >
            {status ? `${status === "sourcing" ? "仕入進行中" : status === "live" ? "販売中" : "監視中"}` : "監視リストへ追加"}
            {!status ? <span className="arrow">›</span> : null}
          </button>
          <button className="pill" type="button">OEM 検討メモ</button>
          <button className="pill" type="button">類似商品を再探索</button>
          <button className="btn-ghost" type="button" style={{ marginTop: 4, padding: 8 }}>
            除外辞書に登録
          </button>
        </div>
      </div>
    </aside>
  );
}
