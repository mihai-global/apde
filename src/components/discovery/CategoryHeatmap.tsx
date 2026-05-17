// /discovery ページのカテゴリ × 価格帯ヒートマップ (Server Component)。
// 14 行 (カテゴリ) × 4 列 (価格帯) のグリッドで cells を可視化する。
// 各セルは <Link> で /search に絞り込み付き遷移する。
//
// R7 改修:
//  - ¥3K-8K 帯 (2-5K + 5-15K) を「狙い目」として強調 (背景アクセント + ヘッダ★)
//  - 件数の数字を大きく (36px)
//  - max 件数を基準にした opacity ベースの色強度 (固定閾値ではなく相対的)
//  - 0 件セルでは queue status バッジを薄く表示 (DONE が大袈裟だった件)
//  - 各セル右下に「相対充足度」の細いバーを追加

import Link from "next/link";
import type { CSSProperties } from "react";
import { CATEGORIES } from "@/lib/keepa/categories";
import { PRICE_BANDS, type PriceBand, type PriceBandId } from "@/lib/keepa/price-bands";
import type { HeatmapCell } from "@/lib/supabase/discovery_stats";
import type { DiscoveryQueueStatus } from "@/lib/types";

interface Props {
  cells: HeatmapCell[];
}

/** ¥3K-8K のスイートスポットに該当する band。 ヘッダ + 列全体に強調 styling を当てる。 */
const HOT_BAND_IDS: ReadonlyArray<PriceBandId> = ["2000-5000", "5000-15000"];

function isHotBand(bandId: PriceBandId): boolean {
  return HOT_BAND_IDS.includes(bandId);
}

/**
 * 全セル中の最大件数を 1 として、 各セル件数を 0..1 に正規化する。
 * 固定閾値だと max が小さい運用初期に全部薄くなりがちなので、 相対値方式。
 */
function intensityScale(cells: HeatmapCell[]): number {
  const max = cells.reduce((m, c) => (c.asinCount > m ? c.asinCount : m), 0);
  return max > 0 ? max : 1;
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

function queueStatusLabel(status: DiscoveryQueueStatus | null): string {
  switch (status) {
    case "pending":
      return "未着手";
    case "running":
      return "取得中…";
    case "done":
      return "巡回済";
    case "failed":
      return "失敗";
    default:
      return "未登録";
  }
}

function queueStatusTone(status: DiscoveryQueueStatus | null): string {
  switch (status) {
    case "pending":
      return "var(--fg-4)";
    case "running":
      return "var(--decision-cond)";
    case "done":
      return "var(--decision-go)";
    case "failed":
      return "var(--decision-no)";
    default:
      return "var(--fg-5)";
  }
}

export function CategoryHeatmap({ cells }: Props) {
  const byKey = new Map(cells.map((c) => [cellKey(c.category, c.bandId), c]));
  const max = intensityScale(cells);

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "200px repeat(4, 1fr)",
    gap: 8,
  };

  return (
    <>
      <div
        style={{
          fontSize: 12,
          color: "var(--fg-3)",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, background: "var(--decision-go-bg)", border: "1px solid var(--decision-go)", marginRight: 6, verticalAlign: "middle" }} />
          多い
        </span>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, background: "var(--bg-2)", border: "1px dashed var(--border-2)", marginRight: 6, verticalAlign: "middle" }} />
          未取得
        </span>
        <span style={{ marginLeft: "auto", color: "var(--decision-cond)", fontWeight: 600 }}>
          ★ 狙い目価格帯 (¥3K–¥8K 帯近辺)
        </span>
      </div>
      <div style={gridStyle}>
        <div style={headerCellBase}>カテゴリ</div>
        {PRICE_BANDS.map((band) => (
          <HeaderCell key={band.id} band={band} hot={isHotBand(band.id)} />
        ))}
        {CATEGORIES.map((cat) => (
          <CategoryRow
            key={cat.id}
            label={cat.label}
            max={max}
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
          />
        ))}
      </div>
    </>
  );
}

const headerCellBase: CSSProperties = {
  padding: "12px 14px",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--fg-3)",
  background: "var(--bg-2)",
  border: "1px solid var(--border-1)",
  textAlign: "center",
};

function HeaderCell({ band, hot }: { band: PriceBand; hot: boolean }) {
  return (
    <div
      style={{
        ...headerCellBase,
        ...(hot
          ? {
              background: "var(--decision-cond-bg)",
              color: "var(--decision-cond)",
              borderColor: "var(--decision-cond)",
              fontWeight: 600,
            }
          : {}),
      }}
    >
      {hot ? "★ " : ""}
      {band.shortLabel}
    </div>
  );
}

// ─── 内部用: 1 カテゴリ分の行 ──────────────────────────────────────────

interface CategoryRowProps {
  label: string;
  cells: HeatmapCell[];
  max: number;
}

function CategoryRow({ label, cells, max }: CategoryRowProps) {
  return (
    <>
      <div
        style={{
          padding: "16px 14px",
          fontSize: 14,
          fontWeight: 500,
          color: "var(--fg-1)",
          background: "var(--bg-1)",
          border: "1px solid var(--border-1)",
          display: "flex",
          alignItems: "center",
        }}
      >
        {label}
      </div>
      {cells.map((cell) => (
        <HeatmapCellView key={`${cell.category}|${cell.bandId}`} cell={cell} max={max} />
      ))}
    </>
  );
}

// ─── 内部用: 1 セル ────────────────────────────────────────────────────

interface CellViewProps {
  cell: HeatmapCell;
  max: number;
}

function HeatmapCellView({ cell, max }: CellViewProps) {
  const hot = isHotBand(cell.bandId);
  const ratio = max > 0 ? cell.asinCount / max : 0;
  const has = cell.asinCount > 0;

  // 件数を相対 opacity に変換 (max=1.0)。 0 件は灰色。
  const baseColor = hot ? "var(--decision-go)" : "var(--decision-go)";
  const background = has
    ? `color-mix(in srgb, ${baseColor} ${Math.round(8 + ratio * 28)}%, var(--bg-1) ${Math.round(72 - ratio * 28)}%)`
    : "var(--bg-2)";
  const borderColor = has
    ? `color-mix(in srgb, ${baseColor} ${Math.round(35 + ratio * 45)}%, transparent)`
    : hot
      ? "var(--decision-cond)"
      : "var(--border-2)";

  const { go, cond, noGo } = cell.decision;

  return (
    <Link
      href={searchHref(cell.category, cell.bandId)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: "14px 14px 12px",
        minHeight: 110,
        background,
        border: `1px solid ${borderColor}`,
        borderStyle: has ? "solid" : "dashed",
        color: "var(--fg-1)",
        textDecoration: "none",
        transition: "transform 0.12s var(--ease-out), box-shadow 0.12s var(--ease-out)",
      }}
      aria-label={`${cell.category} ${cell.bandId} ${cell.asinCount} 件`}
    >
      {/* 大きい件数 */}
      <div
        className="num"
        style={{
          fontSize: 36,
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          color: has ? "var(--fg-1)" : "var(--fg-4)",
        }}
      >
        {cell.asinCount}
      </div>

      {/* decision 内訳 (件数があるときのみ) */}
      {has ? (
        <div
          className="num"
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--fg-3)",
            letterSpacing: 0.2,
          }}
        >
          <span style={{ color: "var(--decision-go)", fontWeight: 600 }}>{go}</span>
          <span style={{ margin: "0 4px", color: "var(--fg-5)" }}>·</span>
          <span style={{ color: "var(--decision-cond)", fontWeight: 600 }}>{cond}</span>
          <span style={{ margin: "0 4px", color: "var(--fg-5)" }}>·</span>
          <span style={{ color: "var(--decision-no)", fontWeight: 600 }}>{noGo}</span>
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--fg-5)" }}>未取得</div>
      )}

      {/* queue status: 控えめに右下 */}
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 8,
          fontSize: 10,
          color: queueStatusTone(cell.queueStatus),
          letterSpacing: 0.4,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: queueStatusTone(cell.queueStatus),
            opacity: cell.queueStatus ? 1 : 0.3,
          }}
        />
        {queueStatusLabel(cell.queueStatus)}
      </div>

      {/* 充足度ミニバー (件数がある時のみ) */}
      {has ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            background: "var(--bg-2)",
          }}
        >
          <div
            style={{
              width: `${Math.max(8, Math.round(ratio * 100))}%`,
              height: "100%",
              background: baseColor,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      ) : null}
    </Link>
  );
}
