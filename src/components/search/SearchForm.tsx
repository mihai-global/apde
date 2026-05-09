"use client";

import { useState, useTransition } from "react";
import { Toggle } from "@/components/primitives/Toggle";
import { generateKeywords } from "@/lib/keywords/generate";
import { yen } from "@/lib/format";
import { runDiscover } from "@/app/(app)/search/actions";

const CATEGORIES = [
  "デスク周り / ガジェット",
  "キッチン雑貨",
  "美容 / 健康",
  "ペット用品",
  "アウトドア",
  "文房具",
  "収納 / 整理",
  "DIY / 工具",
];

export function SearchForm() {
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [priceMin, setPriceMin] = useState(3000);
  const [priceMax, setPriceMax] = useState(8000);
  const [reviewMax, setReviewMax] = useState(500);
  const [limit, setLimit] = useState(50);
  const [applyDictionary, setApplyDictionary] = useState(true);
  const [pending, startTransition] = useTransition();

  const { keywords, axes } = generateKeywords(cat);

  function handleSubmit() {
    startTransition(async () => {
      await runDiscover({
        category: cat,
        minPrice: priceMin,
        maxPrice: priceMax,
        maxReviews: reviewMax,
        limit,
        applyDictionary,
      });
    });
  }

  return (
    <>
      <div className="form-grid" style={{ marginBottom: 48 }}>
        <div>
          <label className="label" htmlFor="cat">カテゴリ</label>
          <select id="cat" className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>または自由入力で指定</div>
        </div>
        <div>
          <label className="label" htmlFor="limit">候補件数上限</label>
          <input
            id="limit"
            className="input"
            type="number"
            value={limit}
            min={5}
            max={100}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
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
          <label className="label" htmlFor="rev">レビュー数上限</label>
          <input
            id="rev"
            className="input"
            type="number"
            value={reviewMax}
            onChange={(e) => setReviewMax(Number(e.target.value))}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>競合参入余地の閾値</div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border-1)", paddingTop: 32, marginBottom: 32 }}>
        <div className="rowsplit" style={{ marginBottom: 16 }}>
          <div className="eyebrow">学習辞書を適用</div>
          <Toggle on={applyDictionary} onChange={setApplyDictionary} />
        </div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
          除外ブランド <span style={{ color: "var(--fg-1)" }}>2件</span> ·
          除外カテゴリ <span style={{ color: "var(--fg-1)" }}>1件</span> ·
          NGパターン <span style={{ color: "var(--fg-1)" }}>2件</span> ·
          有望キーワード <span style={{ color: "var(--fg-1)" }}>2件</span>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border-1)", paddingTop: 32, marginBottom: 32 }}>
        <div className="rowsplit" style={{ marginBottom: 16 }}>
          <div className="eyebrow">生成キーワード (プレビュー)</div>
          <span className="btn-text blue" style={{ cursor: "default" }}>5軸テンプレ</span>
        </div>
        <div className="kw-list">
          {keywords.map((k) => (
            <span key={k} className="kw"><span>{k}</span><span className="kx" aria-hidden>×</span></span>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 12 }}>
          軸内訳: 用途 ✓ {axes.use} / 問題解決 ✓ {axes.problem} / サイズ ✓ {axes.size} / セット ✓ {axes.set} / 利用シーン ✓ {axes.scene}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", borderTop: "1px solid var(--fg-1)", paddingTop: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--fg-3)" }}>想定API消費 (概算)</div>
          <div style={{ fontSize: 18, fontFeatureSettings: '"tnum" 1' }}>
            {yen(168)}
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>(Keepa 50 + Gemini 1)</span>
          </div>
        </div>
        <button type="button" className="pill" disabled>下書き保存</button>
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
            キーワード生成 → Amazon検索 → Keepa取得 → 初期判定…
          </div>
        </div>
      ) : null}
    </>
  );
}
