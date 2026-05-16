"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearDiscoveryQueue,
  enqueueDiscoverySeeds,
  type ClearQueueResult,
  type EnqueueSeedsResult,
} from "@/app/(app)/diagnostics/actions";
import type { DiscoveryQueueCounts } from "@/lib/supabase/discovery_queue";
import type { DiscoveryQueueRow } from "@/lib/types";

interface Props {
  counts: DiscoveryQueueCounts;
  /** 直近の updated_at 順 (最大 6 件) で表示する */
  recent: DiscoveryQueueRow[];
}

/**
 * R6: discovery_queue の状態を /diagnostics に表示。
 *  - status 別件数 (pending/running/done/failed)
 *  - 直近更新ジョブ 6 件
 *  - シード投入 / リセット ボタン
 */
export function DiscoveryQueuePanel({ counts, recent }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<"enqueue" | "clear" | null>(null);
  const [lastEnqueue, setLastEnqueue] = useState<EnqueueSeedsResult | null>(null);
  const [lastClear, setLastClear] = useState<ClearQueueResult | null>(null);

  function handleEnqueue() {
    if (
      !window.confirm(
        "14 カテゴリ × 4 価格帯 (最大 56 エントリ) の seed を discovery_queue に投入しますか? \n(既存と重複する行はスキップ。 Keepa 0 token)",
      )
    ) return;
    setPendingKind("enqueue");
    setLastEnqueue(null);
    startTransition(async () => {
      const r = await enqueueDiscoverySeeds();
      setLastEnqueue(r);
      setPendingKind(null);
      if (r.ok) router.refresh();
    });
  }

  function handleClear() {
    if (
      !window.confirm(
        "discovery_queue の全エントリを削除しますか? \n(履歴も消えます。 Keepa 0 token)",
      )
    ) return;
    setPendingKind("clear");
    setLastClear(null);
    startTransition(async () => {
      const r = await clearDiscoveryQueue();
      setLastClear(r);
      setPendingKind(null);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <div className="kpi">
          <div className="label">pending</div>
          <div className="val num">{counts.pending}</div>
          <div className="sub">cron で順次消化</div>
        </div>
        <div className="kpi">
          <div className="label">running</div>
          <div className="val num">{counts.running}</div>
          <div className="sub">cron 実行中 (通常 0 か 1)</div>
        </div>
        <div className="kpi go">
          <div className="label">done</div>
          <div className="val num">{counts.done}</div>
          <div className="sub">24h 経過で再周回</div>
        </div>
        <div className="kpi no">
          <div className="label">failed</div>
          <div className="val num">{counts.failed}</div>
          <div className="sub">5 回連続失敗で確定</div>
        </div>
      </div>

      <div className="cluster" style={{ gap: 8, marginBottom: 16 }}>
        <button type="button" className="pill solid" onClick={handleEnqueue} disabled={pending}>
          {pendingKind === "enqueue" ? "投入中…" : "シードを投入 (14 カテゴリ × 4 価格帯)"}
          <span className="arrow">›</span>
        </button>
        <button type="button" className="pill" onClick={handleClear} disabled={pending}>
          {pendingKind === "clear" ? "削除中…" : "キューをクリア"}
          <span className="arrow">›</span>
        </button>
      </div>

      {lastEnqueue ? (
        <div
          style={{
            padding: "8px 12px",
            border: `1px solid ${lastEnqueue.ok ? "var(--decision-go)" : "var(--decision-no)"}`,
            background: lastEnqueue.ok ? "var(--decision-go-bg)" : "var(--decision-no-bg)",
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          {lastEnqueue.ok ? `シード投入: ${lastEnqueue.added} 件追加` : `エラー: ${lastEnqueue.error}`}
        </div>
      ) : null}
      {lastClear ? (
        <div
          style={{
            padding: "8px 12px",
            border: `1px solid ${lastClear.ok ? "var(--decision-go)" : "var(--decision-no)"}`,
            background: lastClear.ok ? "var(--decision-go-bg)" : "var(--decision-no-bg)",
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          {lastClear.ok ? `キュークリア: ${lastClear.deleted} 件削除` : `エラー: ${lastClear.error}`}
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 8 }}>直近更新</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>id</th>
                <th>category</th>
                <th>price</th>
                <th>status</th>
                <th className="right">ingested</th>
                <th>last run</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.category}</td>
                  <td className="num" style={{ fontSize: 12 }}>
                    {r.min_price !== null && r.max_price !== null
                      ? `¥${r.min_price.toLocaleString()}–${r.max_price.toLocaleString()}`
                      : "—"}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background:
                          r.status === "done"
                            ? "var(--decision-go-bg)"
                            : r.status === "failed"
                              ? "var(--decision-no-bg)"
                              : r.status === "running"
                                ? "var(--decision-cond-bg)"
                                : "var(--bg-2)",
                        color:
                          r.status === "done"
                            ? "var(--decision-go)"
                            : r.status === "failed"
                              ? "var(--decision-no)"
                              : r.status === "running"
                                ? "var(--decision-cond)"
                                : "var(--fg-3)",
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="right num">{r.ingested_count ?? "—"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>
                    {r.last_run_at ? new Date(r.last_run_at).toLocaleString("ja-JP") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          キューは空です。 「シードを投入」ボタンで 14 カテゴリ × 4 価格帯を一気に登録できます。
        </div>
      )}
    </div>
  );
}
