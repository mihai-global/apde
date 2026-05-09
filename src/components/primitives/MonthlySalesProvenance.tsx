import type { MonthlySalesSource } from "@/lib/types";

const LABEL: Record<MonthlySalesSource, string> = {
  keepa: "Keepa 実測",
  bsr: "BSR 推定",
  seed: "モック",
};

const TONE: Record<MonthlySalesSource, { fg: string; bg: string; bo: string }> = {
  keepa: { fg: "var(--decision-go)", bg: "var(--decision-go-bg)", bo: "var(--decision-go)" },
  bsr: { fg: "var(--decision-cond)", bg: "var(--decision-cond-bg)", bo: "var(--decision-cond)" },
  seed: { fg: "var(--fg-4)", bg: "var(--bg-3)", bo: "var(--border-2)" },
};

const TOOLTIP: Record<MonthlySalesSource, string> = {
  keepa: "Keepa monthlySold (Amazon 推定値) をそのまま採用",
  bsr: "Keepa が monthlySold を提供しないため、BSR ベースで荒く推定",
  seed: "Keepa から取得できず、seed 乱数のフォールバック値",
};

interface Props {
  source?: MonthlySalesSource;
  /** false ならアイコンのみのコンパクト表示 (一覧の狭い列向け) */
  compact?: boolean;
}

export function MonthlySalesProvenance({ source, compact = false }: Props) {
  if (!source) return null;
  const tone = TONE[source];
  const label = LABEL[source];
  if (compact) {
    return (
      <span
        title={TOOLTIP[source]}
        style={{
          display: "inline-flex",
          alignItems: "center",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tone.fg,
          marginLeft: 4,
          verticalAlign: "middle",
        }}
        aria-label={label}
      />
    );
  }
  return (
    <span
      title={TOOLTIP[source]}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px",
        fontSize: 9,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.bo}`,
        fontWeight: 600,
        marginLeft: 6,
        verticalAlign: "middle",
      }}
    >
      {label}
    </span>
  );
}
