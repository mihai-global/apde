"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recomputeAllMarketAnalysis,
  type RecomputeAllResult,
} from "@/app/(app)/diagnostics/actions";

/**
 * /diagnostics に置く管理ボタン。 評価式や brand-policy を変えたあとに、
 * DB に存在する全 market_analysis を再計算する (Keepa を呼ばない / 0 token)。
 */
export function RecomputeAllButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<RecomputeAllResult | null>(null);

  function handleClick() {
    if (
      !window.confirm(
        "全 market_analysis 行を再計算しますか? \n(Keepa 呼び出しなし / 0 token、 ~10 件/秒)",
      )
    ) return;
    setLast(null);
    startTransition(async () => {
      const r = await recomputeAllMarketAnalysis();
      setLast(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        className="pill solid"
        onClick={handleClick}
        disabled={pending}
        style={{ marginBottom: 12 }}
      >
        {pending ? "再計算中…" : "全 ASIN 再計算"}
        <span className="arrow">›</span>
      </button>
      {last ? (
        <div
          style={{
            padding: "8px 12px",
            border: `1px solid ${last.ok ? "var(--decision-go)" : "var(--decision-no)"}`,
            background: last.ok ? "var(--decision-go-bg)" : "var(--decision-no-bg)",
            fontSize: 12,
          }}
        >
          {last.ok
            ? `完了: ${last.succeeded} / ${last.total} 件 成功 (${last.failed} 失敗) / ${(
                last.durationMs / 1000
              ).toFixed(1)} 秒`
            : `エラー: ${last.error}`}
        </div>
      ) : null}
    </div>
  );
}
