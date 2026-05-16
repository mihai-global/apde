// /discovery ページのカテゴリ × 価格帯ヒートマップ (Server Component)。
// 14 行 (カテゴリ) × 4 列 (価格帯) のグリッドで cells を可視化する。
// 各セルは <Link> で /search に絞り込み付き遷移する。

import Link from "next/link";
import type { CSSProperties } from "react";
import { CATEGORIES } from "@/lib/keepa/categories";
import { PRICE_BANDS, type PriceBandId } from "@/lib/keepa/price-bands";
import type { HeatmapCell } from "@/lib/supabase/discovery_stats";
import type { DiscoveryQueueStatus } from "@/lib/types";

interface Props {
  cells: HeatmapCell[];
}

/** asinCount から段階的な背景色を決定する。 0 = 「穴」 (灰)、 増えるほど濃く緑。 */
function backgroundForCount(count: number): string {
  if (count <= 0) return "var(--bg-2)";
  if (count <= 10) return "var(--decision-cond-bg)";
  if (count <= 50) return "color-mix(in srgb, var(--decision-go-bg) 80%, var(--decision-cond-bg) 20%)";
  return "var(--decision-go-bg)";
}

function borderForCount(count: number): string {
  if (count <= 0) return "var(--border-1)";
  if (count <= 10) return "var(--decision-cond)";
  return "var(--decision-go)";
}

function queueBadgeStyle(status: DiscoveryQueueStatus): {
  background: string;
  color: string;
  label: string;
} {
  switch (status) {
    case "pending":
      return { background: "var(--bg-3)", color: "var(--fg-3)", label: "pending" };
    case "running":
      return {
        background: "var(--decision-cond-bg)",
        color: "var(--decision-cond)",
        label: "running",
      };
    case "done":
      return {
        background: "var(--decision-go-bg)",
        color: "var(--decision-go)",
        label: "done",
      };
    case "failed":
      return {
        background: "var(--decision-no-bg)",
        color: "var(--decision-no)",
        label: "failed",
      };
  }
}

function cellKey(category: string, bandId: PriceBandId): string {
  return `${category}|${bandId}`;
}

function searchHref(category: string, bandId: PriceBandId): string {
  const params = new URLSearchParams();
  params.set("category", category);
  const band = PRICE_BANDS.find((b) => b.id === bandId);
  if (band) {
    params.set("minPrice", String(band.min));
    params.set("maxPrice", String(band.max));
  }
  return `/search?${params.toString()}`;
}

export function CategoryHeatmap({ cells }: Props) {
  // 万一 cells に抜けがあっても 0 セルでフォールバックできるよう Map 化。
  const byKey = new Map(cells.map((c) => [cellKey(c.category, c.bandId), c]));

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "180px repeat(4, 1fr)",
    gap: 6,
    fontSize: 12,
  };

  const headerCellStyle: CSSProperties = {
    padding: "10px 12px",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--fg-3)",
    background: "var(--bg-2)",
    border: "1px solid var(--border-1)",
  };

  const rowLabelStyle: CSSProperties = {
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--fg-1)",
    background: "var(--bg-1)",
    border: "1px solid var(--border-1)",
    display: "flex",
    alignItems: "center",
  };

  const cellLinkStyle = (count: number): CSSProperties => ({
    position: "relative",
    display: "block",
    padding: "12px 12px 10px",
    minHeight: 76,
    background: backgroundForCount(count),
    border: `1px solid ${borderForCount(count)}`,
    color: "var(--fg-1)",
    textDecoration: "none",
    transition: "transform 0.12s var(--ease-out), box-shadow 0.12s var(--ease-out)",
  });

  return (
    <div style={gridStyle}>
      {/* ヘッダ行: 「カテゴリ」 + 4 価格帯ラベル */}
      <div style={headerCellStyle}>カテゴリ</div>
      {PRICE_BANDS.map((band) => (
        <div key={band.id} style={{ ...headerCellStyle, textAlign: "center" }}>
          {band.shortLabel}
        </div>
      ))}

      {/* 14 カテゴリ行 */}
      {CATEGORIES.map((cat) => (
        <CategoryRow
          key={cat.id}
          label={cat.label}
          cells={PRICE_BANDS.map(
            (band) =>
              byKey.get(cellKey(cat.label, band.id)) ?? {
                category: cat.label,
                bandId: band.id,
                asinCount: 0,
                decision: { go: 0, cond: 0, noGo: 0 },
                queueStatus: null,
                lastRunAt: null,
                ingestedCount: null,
              },
          )}
          rowLabelStyle={rowLabelStyle}
          cellLinkStyle={cellLinkStyle}
        />
      ))}
    </div>
  );
}

// ─── 内部用: 1 カテゴリ分の行 ──────────────────────────────────────────

interface CategoryRowProps {
  label: string;
  cells: HeatmapCell[];
  rowLabelStyle: CSSProperties;
  cellLinkStyle: (count: number) => CSSProperties;
}

function CategoryRow({
  label,
  cells,
  rowLabelStyle,
  cellLinkStyle,
}: CategoryRowProps) {
  return (
    <>
      <div style={rowLabelStyle}>{label}</div>
      {cells.map((cell) => {
        const badge = cell.queueStatus ? queueBadgeStyle(cell.queueStatus) : null;
        const { go, cond, noGo } = cell.decision;
        return (
          <Link
            key={`${cell.category}|${cell.bandId}`}
            href={searchHref(cell.category, cell.bandId)}
            style={cellLinkStyle(cell.asinCount)}
            aria-label={`${cell.category} ${cell.bandId} (${cell.asinCount} 件)`}
          >
            {badge ? (
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  padding: "1px 6px",
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderRadius: 3,
                  background: badge.background,
                  color: badge.color,
                }}
              >
                {badge.label}
              </span>
            ) : null}
            <div
              className="num"
              style={{
                fontSize: 22,
                fontWeight: 500,
                lineHeight: 1.1,
                color: cell.asinCount > 0 ? "var(--fg-1)" : "var(--fg-4)",
              }}
            >
              {cell.asinCount}
            </div>
            {cell.asinCount > 0 ? (
              <div
                className="num"
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--fg-3)",
                  letterSpacing: 0.2,
                }}
              >
                <span style={{ color: "var(--decision-go)" }}>{go}</span>
                {" / "}
                <span style={{ color: "var(--decision-cond)" }}>{cond}</span>
                {" / "}
                <span style={{ color: "var(--decision-no)" }}>{noGo}</span>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--fg-5)",
                }}
              >
                未取得
              </div>
            )}
          </Link>
        );
      })}
    </>
  );
}
