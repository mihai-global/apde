"use client";

import { useState, useTransition } from "react";
import { Chip } from "@/components/primitives/Chip";
import { createDictionaryEntry, deleteDictionaryEntry } from "@/app/(app)/dictionary/actions";
import type { DictionaryRow, DictionaryType } from "@/lib/types";

const TYPE_LABEL: Record<DictionaryType, string> = {
  exclude_brand: "除外ブランド",
  exclude_category: "除外カテゴリ",
  ng_pattern: "NGパターン",
  promising_keyword: "有望キーワード",
};

const TYPE_ORDER: DictionaryType[] = [
  "exclude_brand",
  "exclude_category",
  "ng_pattern",
  "promising_keyword",
];

interface DictionaryManagerProps {
  rows: DictionaryRow[];
}

export function DictionaryManager({ rows }: DictionaryManagerProps) {
  const [filter, setFilter] = useState<DictionaryType | "all">("all");
  const [type, setType] = useState<DictionaryType>("exclude_brand");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  function handleAdd() {
    if (!value.trim()) return;
    startTransition(async () => {
      await createDictionaryEntry({ type, value, note });
      setValue("");
      setNote("");
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      await deleteDictionaryEntry(id);
    });
  }

  return (
    <>
      <div className="cluster" style={{ marginBottom: 24 }}>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          すべて ({rows.length})
        </Chip>
        {TYPE_ORDER.map((t) => (
          <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
            {TYPE_LABEL[t]} ({rows.filter((r) => r.type === t).length})
          </Chip>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr 1fr auto",
          gap: 12,
          alignItems: "end",
          marginBottom: 32,
          padding: 16,
          border: "1px solid var(--border-1)",
        }}
      >
        <div>
          <label className="label" htmlFor="dict-type">種別</label>
          <select
            id="dict-type"
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value as DictionaryType)}
          >
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dict-value">値</label>
          <input
            id="dict-value"
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="例: DAISO"
          />
        </div>
        <div>
          <label className="label" htmlFor="dict-note">メモ (任意)</label>
          <input
            id="dict-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="このルールの理由を残す"
          />
        </div>
        <button
          type="button"
          className="pill solid"
          onClick={handleAdd}
          disabled={pending || !value.trim()}
        >
          追加 <span className="arrow">›</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: "16px 0" }}>
          該当する辞書エントリはありません。
        </div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 160 }}>種別</th>
              <th>値</th>
              <th>メモ</th>
              <th style={{ width: 100 }}>登録</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td><span className="tag">{TYPE_LABEL[row.type]}</span></td>
                <td>{row.value}</td>
                <td className="muted">{row.note ?? "—"}</td>
                <td className="num">{new Date(row.created_at).toLocaleDateString("ja-JP")}</td>
                <td>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => handleRemove(row.id)}
                    disabled={pending}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
