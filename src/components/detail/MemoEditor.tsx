"use client";

import { useState } from "react";
import { Chip } from "@/components/primitives/Chip";

interface MemoEditorProps {
  asin: string;
  initialNote?: string;
  initialTags?: string[];
}

export function MemoEditor({ asin, initialNote = "", initialTags = ["#OEM検討中"] }: MemoEditorProps) {
  const [note, setNote] = useState(initialNote);
  const [tags] = useState<string[]>(initialTags);
  // 永続化は Step 9 (Watchlist API) と統合予定。現在は localStorage に保存。
  function handleSave() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`apde:memo:${asin}`, note);
    }
  }
  return (
    <section className="detail-section">
      <div className="section-head">
        <span className="num">08</span>
        <div className="ttl">個人メモ</div>
      </div>
      <textarea
        className="textarea"
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="この商品についてのメモを残す..."
        onBlur={handleSave}
      />
      <div className="cluster" style={{ marginTop: 12 }}>
        {tags.map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
        <button type="button" className="btn-ghost">
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>+ タグ追加</span>
        </button>
      </div>
    </section>
  );
}
