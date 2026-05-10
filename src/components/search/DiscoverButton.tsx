"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CategoryDiscoverModal } from "@/components/search/CategoryDiscoverModal";

/**
 * /search の上部に置く client 制御ボタン。
 * クリックでモーダルを開き、 ingest 完了後に router.refresh() で
 * server component を再描画する。
 */
export function DiscoverButton() {
  const [open, setOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{ ingested: number } | null>(null);
  const router = useRouter();

  return (
    <>
      <div className="cluster" style={{ gap: 12 }}>
        <button
          type="button"
          className="pill solid"
          onClick={() => setOpen(true)}
        >
          新カテゴリ調査
          <span className="arrow">›</span>
        </button>
        {lastResult ? (
          <span className="muted" style={{ fontSize: 12 }}>
            直近: {lastResult.ingested} 件追加
          </span>
        ) : null}
      </div>
      <CategoryDiscoverModal
        open={open}
        onClose={() => setOpen(false)}
        onComplete={(r) => {
          setLastResult({ ingested: r.ingested });
          router.refresh();
        }}
      />
    </>
  );
}
