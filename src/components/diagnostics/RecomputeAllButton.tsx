"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  purgeEmptyAsins,
  reclassifyProductCategories,
  recomputeAllMarketAnalysis,
  type PurgeEmptyResult,
  type ReclassifyResult,
  type RecomputeAllResult,
} from "@/app/(app)/diagnostics/actions";

/**
 * /diagnostics に置く管理ボタン群。
 * - 全 ASIN 再計算 (Keepa 0 token、評価式変更時の反映)
 * - 空 ASIN 削除 (title が ASIN のまま + price 無しのノイズ行を一掃)
 * - カテゴリ再分類 (leaf → root、 ヒートマップ集計用)
 */
export function RecomputeAllButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<"recompute" | "purge" | "reclassify" | null>(null);
  const [lastRecompute, setLastRecompute] = useState<RecomputeAllResult | null>(null);
  const [lastPurge, setLastPurge] = useState<PurgeEmptyResult | null>(null);
  const [lastReclassify, setLastReclassify] = useState<ReclassifyResult | null>(null);

  function handleRecompute() {
    if (
      !window.confirm(
        "全 market_analysis 行を再計算しますか? \n(Keepa 呼び出しなし / 0 token、 ~10 件/秒)",
      )
    ) return;
    setPendingKind("recompute");
    setLastRecompute(null);
    startTransition(async () => {
      const r = await recomputeAllMarketAnalysis();
      setLastRecompute(r);
      setPendingKind(null);
      if (r.ok) router.refresh();
    });
  }

  function handlePurge() {
    if (
      !window.confirm(
        "title 未取得 + price 未取得のノイズ ASIN を削除しますか? \n(cascade で snapshot / market_analysis / history も消えます)",
      )
    ) return;
    setPendingKind("purge");
    setLastPurge(null);
    startTransition(async () => {
      const r = await purgeEmptyAsins();
      setLastPurge(r);
      setPendingKind(null);
      if (r.ok) router.refresh();
    });
  }

  function handleReclassify() {
    if (
      !window.confirm(
        "Keepa を再叩きして products.category を root ラベル (14 カテゴリのいずれか) に正規化しますか? \n(1 ASIN ≈ 1 token 消費。 残 token を見ながら処理し、 足りなければ途中で停止します。 再実行で続きを処理)",
      )
    ) return;
    setPendingKind("reclassify");
    setLastReclassify(null);
    startTransition(async () => {
      const r = await reclassifyProductCategories();
      setLastReclassify(r);
      setPendingKind(null);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div>
      <div className="cluster" style={{ gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className="pill solid"
          onClick={handleRecompute}
          disabled={pending}
        >
          {pendingKind === "recompute" ? "再計算中…" : "全 ASIN 再計算"}
          <span className="arrow">›</span>
        </button>
        <button
          type="button"
          className="pill"
          onClick={handleReclassify}
          disabled={pending}
        >
          {pendingKind === "reclassify" ? "再分類中…" : "カテゴリ再分類"}
          <span className="arrow">›</span>
        </button>
        <button
          type="button"
          className="pill"
          onClick={handlePurge}
          disabled={pending}
        >
          {pendingKind === "purge" ? "削除中…" : "空 ASIN を一掃"}
          <span className="arrow">›</span>
        </button>
      </div>
      {lastRecompute ? (
        <div
          style={{
            padding: "8px 12px",
            border: `1px solid ${lastRecompute.ok ? "var(--decision-go)" : "var(--decision-no)"}`,
            background: lastRecompute.ok ? "var(--decision-go-bg)" : "var(--decision-no-bg)",
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          {lastRecompute.ok
            ? `再計算 完了: ${lastRecompute.succeeded} / ${lastRecompute.total} 件 成功 (${lastRecompute.failed} 失敗) / ${(
                lastRecompute.durationMs / 1000
              ).toFixed(1)} 秒`
            : `エラー: ${lastRecompute.error}`}
        </div>
      ) : null}
      {lastPurge ? (
        <div
          style={{
            padding: "8px 12px",
            border: `1px solid ${lastPurge.ok ? "var(--decision-go)" : "var(--decision-no)"}`,
            background: lastPurge.ok ? "var(--decision-go-bg)" : "var(--decision-no-bg)",
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          {lastPurge.ok
            ? `空 ASIN 削除: ${lastPurge.deleted} 件`
            : `エラー: ${lastPurge.error}`}
        </div>
      ) : null}
      {lastReclassify ? (
        <div
          style={{
            padding: "8px 12px",
            border: `1px solid ${lastReclassify.ok ? "var(--decision-go)" : "var(--decision-no)"}`,
            background: lastReclassify.ok ? "var(--decision-go-bg)" : "var(--decision-no-bg)",
            fontSize: 12,
          }}
        >
          {lastReclassify.ok
            ? `再分類完了: ${lastReclassify.updated} 件更新 / ${lastReclassify.skipped} 件スキップ / 残 ${lastReclassify.remaining} 件 (使用 ${lastReclassify.tokensUsed} token, 残 ${lastReclassify.tokensLeft})${lastReclassify.remaining > 0 ? "。 token 補充後にもう一度押してください" : ""}`
            : `エラー: ${lastReclassify.error}`}
        </div>
      ) : null}
    </div>
  );
}
