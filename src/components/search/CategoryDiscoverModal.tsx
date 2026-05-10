"use client";

import { useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/keepa/categories";
import { yen } from "@/lib/format";
import {
  runIngestDiscover,
  type RunIngestDiscoverResult,
} from "@/app/(app)/search/actions";

interface CategoryDiscoverModalProps {
  open: boolean;
  onClose: () => void;
  /** ingest 完了後に親に結果を伝える (toast / 件数バッジ表示用) */
  onComplete?: (result: RunIngestDiscoverResult) => void;
}

/**
 * 新カテゴリ調査モーダル。
 * Keepa /query を 1 コール (10 token 程度) 投げて products / keepa_snapshot /
 * market_analysis を永続化する。 完了後はモーダルを閉じ、 /search が revalidate される。
 */
export function CategoryDiscoverModal({
  open,
  onClose,
  onComplete,
}: CategoryDiscoverModalProps) {
  const [categoryId, setCategoryId] = useState<string>(CATEGORIES[0]!.id);
  const [keyword, setKeyword] = useState("");
  const [priceMin, setPriceMin] = useState(3000);
  const [priceMax, setPriceMax] = useState(8000);
  const [reviewMin, setReviewMin] = useState(30);
  const [reviewMax, setReviewMax] = useState(500);
  const [perPage, setPerPage] = useState(50);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await runIngestDiscover({
        category: categoryId,
        keyword: keyword.trim() || undefined,
        minPrice: priceMin,
        maxPrice: priceMax,
        minReviews: reviewMin,
        maxReviews: reviewMax,
        perPage,
      });
      if (!result.ok) {
        setError(result.error ?? "調査に失敗しました");
        return;
      }
      onComplete?.(result);
      onClose();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dlg-discover-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8vh 16px",
        zIndex: 60,
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border-1)",
          width: "100%",
          maxWidth: 720,
          padding: 32,
          borderRadius: 4,
        }}
      >
        <div className="rowsplit" style={{ marginBottom: 16 }}>
          <h2 id="dlg-discover-title" className="h3" style={{ margin: 0 }}>
            新カテゴリ調査
          </h2>
          <button className="btn-ghost" onClick={onClose} aria-label="閉じる" type="button">
            ×
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 24, lineHeight: 1.7 }}>
          Keepa /query を 1 コール (約 5-10 token) 投げて指定件数を一括取得します。
          結果は DB に永続化され、以後の探索では Keepa を再呼び出ししません。
          開始前に Keepa /token で残量を確認し、 -10 以下なら拒否します (過剰使用防止)。
        </p>

        <div className="form-grid" style={{ marginBottom: 24 }}>
          <div>
            <label className="label" htmlFor="dlg-cat">カテゴリ (任意)</label>
            <select
              id="dlg-cat"
              className="select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Amazon JP の大カテゴリ
            </div>
          </div>
          <div>
            <label className="label" htmlFor="dlg-pp">候補件数上限</label>
            <input
              id="dlg-pp"
              className="input"
              type="number"
              value={perPage}
              min={5}
              max={200}
              onChange={(e) => setPerPage(Number(e.target.value))}
            />
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              既定 50 / 最大 200 (Keepa /query は最低 50)
            </div>
          </div>
          <div>
            <label className="label" htmlFor="dlg-pmin">価格帯</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                id="dlg-pmin"
                className="input"
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(Number(e.target.value))}
              />
              <span className="muted">〜</span>
              <input
                className="input"
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="dlg-rev">レビュー数</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                id="dlg-revmin"
                className="input"
                type="number"
                value={reviewMin}
                onChange={(e) => setReviewMin(Number(e.target.value))}
                placeholder="下限"
              />
              <span className="muted">〜</span>
              <input
                id="dlg-rev"
                className="input"
                type="number"
                value={reviewMax}
                onChange={(e) => setReviewMax(Number(e.target.value))}
                placeholder="上限"
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label className="label" htmlFor="dlg-kw">キーワード (任意)</label>
          <input
            id="dlg-kw"
            className="input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="例: ケーブル収納 / 湯たんぽ / モニター下"
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            空欄ならカテゴリ全体。 指定するとタイトルに部分一致する商品に絞られます。
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: 12,
              border: "1px solid var(--decision-no)",
              background: "var(--decision-no-bg)",
              fontSize: 13,
              color: "var(--decision-no)",
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            borderTop: "1px solid var(--fg-1)",
            paddingTop: 20,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "var(--fg-3)" }}>想定 API 消費</div>
            <div style={{ fontSize: 18, fontFeatureSettings: '"tnum" 1' }}>
              {yen(15)}
              <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                (Keepa /query 1〜2 回)
              </span>
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose} type="button" disabled={pending}>
            キャンセル
          </button>
          <button
            type="button"
            className="pill solid"
            onClick={handleSubmit}
            disabled={pending}
          >
            {pending ? "調査中…" : "調査を実行"}
            <span className="arrow">›</span>
          </button>
        </div>

        {pending ? (
          <div className="notif" style={{ marginTop: 16 }}>
            Keepa /query → スコアリング → DB 永続化…
          </div>
        ) : null}
      </div>
    </div>
  );
}
