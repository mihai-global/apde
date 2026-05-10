"use client";

import { useState, useTransition } from "react";
import { Toggle } from "@/components/primitives/Toggle";
import { CATEGORIES } from "@/lib/keepa/categories";
import { yen } from "@/lib/format";
import { runDiscover } from "@/app/(app)/search/actions";

export function SearchForm() {
  const [categoryId, setCategoryId] = useState(CATEGORIES[0]!.id);
  const [keyword, setKeyword] = useState("");
  const [priceMin, setPriceMin] = useState(3000);
  const [priceMax, setPriceMax] = useState(8000);
  const [reviewMax, setReviewMax] = useState(500);
  const [reviewMin, setReviewMin] = useState(30);
  const [limit, setLimit] = useState(100);
  const [applyDictionary, setApplyDictionary] = useState(true);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      await runDiscover({
        category: categoryId,
        keyword: keyword.trim() || undefined,
        minPrice: priceMin,
        maxPrice: priceMax,
        maxReviews: reviewMax,
        minReviews: reviewMin,
        limit,
        applyDictionary,
      });
    });
  }

  return (
    <>
      <div className="form-grid" style={{ marginBottom: 32 }}>
        <div>
          <label className="label" htmlFor="cat">カテゴリ</label>
          <select
            id="cat"
            className="select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Amazon JP の大カテゴリ。 Keepa rootCategory にマッピング
          </div>
        </div>
        <div>
          <label className="label" htmlFor="limit">候補件数上限</label>
          <input
            id="limit"
            className="input"
            type="number"
            value={limit}
            min={5}
            max={200}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            既定 100 / 最大 200 (Keepa /query 1〜2 ページ)
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pmin">価格帯</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              id="pmin"
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
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>推奨ゾーン ¥3,000〜¥8,000</div>
        </div>
        <div>
          <label className="label" htmlFor="rev">レビュー数</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              id="revmin"
              className="input"
              type="number"
              value={reviewMin}
              onChange={(e) => setReviewMin(Number(e.target.value))}
              placeholder="下限 (例: 30)"
            />
            <span className="muted">〜</span>
            <input
              id="rev"
              className="input"
              type="number"
              value={reviewMax}
              onChange={(e) => setReviewMax(Number(e.target.value))}
              placeholder="上限 (例: 500)"
            />
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>レビュー帯で参入余地と信頼度を絞る</div>
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <label className="label" htmlFor="kw">キーワード (任意)</label>
        <input
          id="kw"
          className="input"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="例: ケーブル収納 / 湯たんぽ / モニター下"
        />
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          空欄ならカテゴリ全体から条件にマッチする商品を取得。
          指定するとタイトルに部分一致する商品に絞られます。
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border-1)", paddingTop: 32, marginBottom: 32 }}>
        <div className="rowsplit" style={{ marginBottom: 16 }}>
          <div className="eyebrow">学習辞書を適用</div>
          <Toggle on={applyDictionary} onChange={setApplyDictionary} />
        </div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
          除外ブランド / 除外カテゴリ / NGパターン / 有望キーワード を辞書ページで管理。
          ON のとき探索段階で自動除外され、結果ページの「自動除外」欄に理由付きで表示されます。
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", borderTop: "1px solid var(--fg-1)", paddingTop: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--fg-3)" }}>想定API消費 (概算)</div>
          <div style={{ fontSize: 18, fontFeatureSettings: '"tnum" 1' }}>
            {yen(15)}
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
              (Keepa /query 1〜2 回)
            </span>
          </div>
        </div>
        <button type="button" className="pill solid" onClick={handleSubmit} disabled={pending}>
          {pending ? "探索中…" : "探索を実行"}
          <span className="arrow">›</span>
        </button>
      </div>

      {pending ? (
        <div className="notif">
          <div className="cluster" style={{ gap: 12 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#fff",
                animation: "pulse 1s infinite",
              }}
            />
            Keepa /query → スコアリング → 辞書フィルタ → 上位{limit}件…
          </div>
        </div>
      ) : null}
    </>
  );
}
