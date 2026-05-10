"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  runIngestDiff,
  runIngestFull,
  type IngestActionResult,
} from "@/app/(app)/products/[asin]/actions";
import { fmtNum, yen } from "@/lib/format";

interface PriceHistoryPoint {
  ts: string;
  price_yen: number | null;
}

interface BsrHistoryPoint {
  ts: string;
  rank: number | null;
}

export interface KeepaSyncPanelProps {
  asin: string;
  /** 1 = sourcing/live (24h), 2 = candidate (7d), 3 = on-demand */
  tier: 1 | 2 | 3;
  /** 最終 history=1 取得 (90 日 cycle) */
  lastFullAt: string | null;
  /** 最終 history=0 取得 (24h/7d cycle) */
  lastDiffAt: string | null;
  priceHistory: PriceHistoryPoint[];
  bsrHistory: BsrHistoryPoint[];
}

const FULL_REFRESH_DAYS = 90;
const TIER_REFRESH_HOURS: Record<1 | 2 | 3, number | null> = {
  1: 24,
  2: 24 * 7,
  3: null,
};

function formatJp(ts: string | null): string {
  if (!ts) return "未取得";
  return new Date(ts).toLocaleString("ja-JP");
}

function elapsedHours(ts: string | null): number | null {
  if (!ts) return null;
  const ms = Date.now() - Date.parse(ts);
  return ms / (60 * 60 * 1000);
}

function fmtElapsed(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}分前`;
  if (hours < 24) return `${Math.round(hours)}時間前`;
  return `${Math.round(hours / 24)}日前`;
}

export function KeepaSyncPanel({
  asin,
  tier,
  lastFullAt,
  lastDiffAt,
  priceHistory,
  bsrHistory,
}: KeepaSyncPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<"full" | "diff" | null>(null);
  const [last, setLast] = useState<IngestActionResult | null>(null);

  const fullElapsed = elapsedHours(lastFullAt);
  const diffElapsed = elapsedHours(lastDiffAt);
  const tierThresholdH = TIER_REFRESH_HOURS[tier];

  const fullDue = fullElapsed === null || fullElapsed >= FULL_REFRESH_DAYS * 24;
  const diffDue =
    diffElapsed === null ||
    (tierThresholdH !== null && diffElapsed >= tierThresholdH);

  const tierLabel = tier === 1 ? "Tier 1 (24h refresh)" : tier === 2 ? "Tier 2 (7d refresh)" : "Tier 3 (オンデマンド)";

  function handleFull() {
    setPendingKind("full");
    setLast(null);
    startTransition(async () => {
      const r = await runIngestFull(asin);
      setLast(r);
      setPendingKind(null);
      if (r.ok) router.refresh();
    });
  }

  function handleDiff() {
    setPendingKind("diff");
    setLast(null);
    startTransition(async () => {
      const r = await runIngestDiff(asin);
      setLast(r);
      setPendingKind(null);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section
      style={{
        marginTop: 32,
        marginBottom: 32,
        padding: 20,
        border: "1px solid var(--border-1)",
        background: "var(--bg-1)",
      }}
    >
      <div className="rowsplit" style={{ marginBottom: 16, alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Keepa 同期 · {tierLabel}
          </div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: 0, maxWidth: 520 }}>
            DB の price_history テーブルが描画ソースです。 Keepa を呼ばずにチャート表示できます。
            必要に応じて下のボタンで 1 token 消費して更新してください。
          </p>
        </div>
        <div className="cluster" style={{ gap: 8 }}>
          <button
            type="button"
            className="pill sm"
            onClick={handleDiff}
            disabled={pending}
          >
            {pendingKind === "diff" ? "取得中…" : `最新値を取得${diffDue ? " ›" : ""}`}
          </button>
          <button
            type="button"
            className="pill sm solid"
            onClick={handleFull}
            disabled={pending}
            title={`/product?history=1 (1 token)。 過去 ${FULL_REFRESH_DAYS} 日 cycle が推奨。`}
          >
            {pendingKind === "full" ? "取得中…" : `履歴を更新${fullDue ? " ›" : ""}`}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
        <Stat
          label="最終 diff (history=0)"
          value={formatJp(lastDiffAt)}
          sub={fmtElapsed(diffElapsed)}
          warn={diffDue}
        />
        <Stat
          label="最終 full (history=1)"
          value={formatJp(lastFullAt)}
          sub={fmtElapsed(fullElapsed)}
          warn={fullDue}
        />
        <Stat
          label="価格データ点数"
          value={`${fmtNum(priceHistory.length)} 点`}
          sub={
            priceHistory.length === 0
              ? "履歴未取得"
              : `${formatJp(priceHistory[0]!.ts).split(" ")[0]} 〜`
          }
        />
      </div>

      {priceHistory.length >= 2 ? (
        <PriceLineChart points={priceHistory} bsr={bsrHistory} />
      ) : (
        <div className="muted" style={{ fontSize: 12, padding: 16, textAlign: "center" }}>
          価格時系列が未取得です。「履歴を更新」を押すと過去 90+ 日のデータが取得できます (1 token)。
        </div>
      )}

      {last ? (
        <div
          role="status"
          style={{
            marginTop: 12,
            padding: "8px 12px",
            border: `1px solid ${last.ok ? "var(--decision-go)" : "var(--decision-no)"}`,
            background: last.ok ? "var(--decision-go-bg)" : "var(--decision-no-bg)",
            fontSize: 12,
          }}
        >
          {last.ok
            ? `更新成功${
                last.pricePoints !== undefined
                  ? ` · 価格 ${last.pricePoints} 点 / BSR ${last.bsrPoints} / 出品者 ${last.sellerPoints}`
                  : ""
              }`
            : `失敗: ${last.error}`}
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: warn ? "var(--decision-cond)" : "var(--fg-1)",
        }}
      >
        {value}
      </div>
      {sub ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

interface PriceLineChartProps {
  points: PriceHistoryPoint[];
  bsr: BsrHistoryPoint[];
}

const W = 720;
const H = 180;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;

function PriceLineChart({ points, bsr }: PriceLineChartProps) {
  const validPrice = points.filter((p) => p.price_yen !== null && p.price_yen > 0);
  if (validPrice.length < 2) return null;

  const ts = validPrice.map((p) => Date.parse(p.ts));
  const yp = validPrice.map((p) => p.price_yen!) as number[];
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const yMin = Math.min(...yp);
  const yMax = Math.max(...yp);

  const x = (t: number) =>
    PAD_L + ((t - tMin) / (tMax - tMin || 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) =>
    PAD_T + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD_T - PAD_B);

  const pricePath = validPrice
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(Date.parse(p.ts))},${y(p.price_yen!)}`)
    .join(" ");

  // BSR は別軸 (右側) で重ねる: 簡易表示なので ratio のみ
  const validBsr = bsr.filter((b) => b.rank !== null && b.rank > 0);
  let bsrPath: string | null = null;
  if (validBsr.length >= 2) {
    const ranks = validBsr.map((b) => b.rank!) as number[];
    const rMin = Math.min(...ranks);
    const rMax = Math.max(...ranks);
    const yb = (v: number) =>
      PAD_T + ((v - rMin) / (rMax - rMin || 1)) * (H - PAD_T - PAD_B);
    bsrPath = validBsr
      .map((b, i) => `${i === 0 ? "M" : "L"}${x(Date.parse(b.ts))},${yb(b.rank!)}`)
      .join(" ");
  }

  // 横軸ラベル (3 つ)
  const ticks = [tMin, (tMin + tMax) / 2, tMax].map((t) => ({
    x: x(t),
    label: new Date(t).toLocaleDateString("ja-JP", { month: "short", day: "numeric" }),
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="価格と BSR の時系列"
    >
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--border-1)" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--border-1)" />
      {[yMin, yMax].map((v, i) => (
        <text
          key={i}
          x={PAD_L - 6}
          y={y(v) + 4}
          fontSize={10}
          fill="var(--fg-3)"
          textAnchor="end"
          fontFamily="var(--font-mono)"
        >
          {yen(v)}
        </text>
      ))}
      {ticks.map((t, i) => (
        <text
          key={i}
          x={t.x}
          y={H - PAD_B + 16}
          fontSize={10}
          fill="var(--fg-3)"
          textAnchor="middle"
        >
          {t.label}
        </text>
      ))}
      {bsrPath ? (
        <path d={bsrPath} stroke="var(--decision-cond)" strokeWidth={1} fill="none" opacity={0.45} />
      ) : null}
      <path d={pricePath} stroke="var(--fg-1)" strokeWidth={1.5} fill="none" />
    </svg>
  );
}
