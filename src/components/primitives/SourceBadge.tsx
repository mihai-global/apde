import type { DataSource } from "@/lib/types";

const LABEL: Record<DataSource, string> = {
  live: "LIVE",
  hybrid: "HYBRID",
  mock: "MOCK",
};

const TONE: Record<DataSource, { fg: string; bg: string; bo: string }> = {
  live: { fg: "var(--decision-go)", bg: "var(--decision-go-bg)", bo: "var(--decision-go)" },
  hybrid: { fg: "var(--decision-cond)", bg: "var(--decision-cond-bg)", bo: "var(--decision-cond)" },
  mock: { fg: "var(--fg-3)", bg: "var(--bg-3)", bo: "var(--border-2)" },
};

interface SourceBadgeProps {
  source: DataSource;
  detail?: string;
}

export function SourceBadge({ source, detail }: SourceBadgeProps) {
  const tone = TONE[source];
  const label = LABEL[source];
  const tooltip =
    source === "live"
      ? "Keepa + LLM ともに実 API"
      : source === "hybrid"
        ? "一部のみ実 API、残りはモックフォールバック"
        : "全データがモック (env 未設定 or API 失敗)";
  return (
    <span
      title={detail ?? tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.bo}`,
        fontWeight: 500,
        fontFeatureSettings: '"tnum" 1',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tone.fg,
        }}
      />
      {label}
    </span>
  );
}
