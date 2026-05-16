import { asinToHslBackground } from "@/lib/keepa/imageUrl";

interface ThumbPlaceholderProps {
  /** 装飾用バリエーション (0-3 で図形種を切替) */
  seed?: number;
  /**
   * 中央に表示する 1-3 文字のテキスト。 ASIN の先頭 2 文字を渡す想定。
   * 文字色は中間グレー、背景は文字列ハッシュ由来の HSL で識別性を担保。
   */
  label?: string;
}

/**
 * 画像が取得できない時のフォールバック。
 *  - label 指定時: 文字 + ハッシュ背景色 (R6 で追加)
 *  - label 未指定: seed 由来の薄い線画 (旧挙動)
 */
export function ThumbPlaceholder({ seed = 1, label }: ThumbPlaceholderProps) {
  if (label && label.length > 0) {
    const text = label.slice(0, 3).toUpperCase();
    const bg = asinToHslBackground(label);
    return (
      <div
        className="thumb-placeholder thumb-placeholder--label"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          color: "#374151",
          fontSize: "0.85rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
        aria-hidden="true"
      >
        {text}
      </div>
    );
  }

  const n = Math.abs(seed) % 4;
  return (
    <div className="thumb-placeholder">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {n === 0 && (
          <g stroke="currentColor" strokeWidth="0.4" fill="none">
            <rect x="20" y="30" width="60" height="40" />
            <line x1="20" y1="50" x2="80" y2="50" />
          </g>
        )}
        {n === 1 && (
          <g stroke="currentColor" strokeWidth="0.4" fill="none">
            <circle cx="50" cy="50" r="25" />
            <circle cx="50" cy="50" r="14" />
          </g>
        )}
        {n === 2 && (
          <g stroke="currentColor" strokeWidth="0.4" fill="none">
            <path d="M20 70 L50 25 L80 70 Z" />
            <line x1="35" y1="70" x2="65" y2="70" />
          </g>
        )}
        {n === 3 && (
          <g stroke="currentColor" strokeWidth="0.4" fill="none">
            <rect x="28" y="20" width="44" height="60" rx="2" />
            <line x1="28" y1="36" x2="72" y2="36" />
          </g>
        )}
      </svg>
    </div>
  );
}
