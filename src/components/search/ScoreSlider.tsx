"use client";

import { useState } from "react";

interface ScoreSliderProps {
  /** 現在の値 (URL から復元)。 0..100。 0 / undefined はフィルタなし扱い。 */
  defaultValue?: number;
  name: string;
}

/**
 * /search の FilterStrip に置く市場魅力度スライダー。
 * 値をライブ表示しつつ、 form 送信時に URL の minScore に反映される。
 */
export function ScoreSlider({ defaultValue, name }: ScoreSliderProps) {
  const [value, setValue] = useState<number>(defaultValue ?? 0);
  return (
    <div>
      <label
        className="label"
        htmlFor={`f-${name}`}
        style={{ display: "flex", justifyContent: "space-between" }}
      >
        <span>市場魅力度 下限</span>
        <span className="num" style={{ color: value > 0 ? "var(--fg-1)" : "var(--fg-3)" }}>
          {value > 0 ? `≥ ${value}` : "—"}
        </span>
      </label>
      <input
        id={`f-${name}`}
        name={name}
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--decision-go)" }}
      />
      <div className="muted" style={{ fontSize: 10, display: "flex", justifyContent: "space-between" }}>
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}
