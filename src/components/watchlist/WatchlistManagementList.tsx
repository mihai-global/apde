"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteWatchlist, updateWatchlistStatus } from "@/app/(app)/watchlist/actions";
import { Chip } from "@/components/primitives/Chip";
import { DBadge } from "@/components/primitives/DBadge";
import { Thumbnail } from "@/components/primitives/Thumbnail";
import { deriveTierFromStatus, type Decision, type Tier, type WatchlistStatus } from "@/lib/types";

export interface ManagedWatchlistRow {
  asin: string;
  title: string;
  brand: string;
  status: WatchlistStatus;
  decision: Decision;
  score: number;
  seed: number;
  imageUrl?: string;
  /** 最終 diff (history=0) 取得時刻。 R5 で表示。 */
  lastDiffAt?: string | null;
}

const TIER_LABEL: Record<Tier, string> = {
  1: "Tier 1 · 24h",
  2: "Tier 2 · 7d",
  3: "Tier 3 · 任意",
};

const TIER_INTERVAL_HOURS: Record<Tier, number | null> = {
  1: 24,
  2: 24 * 7,
  3: null,
};

function nextRefreshLabel(status: WatchlistStatus, lastDiffAt: string | null | undefined): string {
  const tier = deriveTierFromStatus(status);
  const interval = TIER_INTERVAL_HOURS[tier];
  if (interval === null) return "オンデマンド";
  if (!lastDiffAt) return "次回 cron で取得";
  const next = new Date(Date.parse(lastDiffAt) + interval * 60 * 60 * 1000);
  const remainingH = (next.getTime() - Date.now()) / (60 * 60 * 1000);
  if (remainingH <= 0) return "次回 cron で取得";
  if (remainingH < 1) return `${Math.round(remainingH * 60)} 分後`;
  if (remainingH < 24) return `${Math.round(remainingH)} 時間後`;
  return `${Math.round(remainingH / 24)} 日後`;
}

interface WatchlistManagementListProps {
  rows: ManagedWatchlistRow[];
}

const STATUSES: WatchlistStatus[] = ["candidate", "sourcing", "live"];

export function WatchlistManagementList({ rows }: WatchlistManagementListProps) {
  const [filter, setFilter] = useState<WatchlistStatus | "all">("all");
  const [pendingAsin, setPendingAsin] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  function handleStatusChange(asin: string, status: WatchlistStatus) {
    setPendingAsin(asin);
    startTransition(async () => {
      await updateWatchlistStatus(asin, status);
      setPendingAsin(null);
    });
  }

  function handleRemove(asin: string) {
    if (!window.confirm(`${asin} を監視リストから外しますか?`)) return;
    setPendingAsin(asin);
    startTransition(async () => {
      await deleteWatchlist(asin);
      setPendingAsin(null);
    });
  }

  return (
    <>
      <div className="cluster" style={{ marginBottom: 24 }}>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>すべて ({rows.length})</Chip>
        {STATUSES.map((status) => (
          <Chip key={status} active={filter === status} onClick={() => setFilter(status)}>
            {status} ({rows.filter((r) => r.status === status).length})
          </Chip>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: "16px 0" }}>
          該当する監視ASINはありません。
        </div>
      ) : (
        <div className="wlist">
          {filtered.map((row) => {
            const tier = deriveTierFromStatus(row.status);
            return (
              <div
                key={row.asin}
                className="wrow"
                style={{
                  gridTemplateColumns: "48px 1fr auto 130px 200px 80px",
                  opacity: pendingAsin === row.asin ? 0.6 : 1,
                }}
              >
                <Thumbnail src={row.imageUrl} alt={row.title} seed={row.seed} size={40} />
                <span>
                  <Link href={`/products/${row.asin}`} className="pname">{row.title}</Link>
                  <br />
                  <span className="pasin">{row.asin} · {row.brand}</span>
                </span>
                <DBadge decision={row.decision} />
                <span style={{ fontSize: 11, lineHeight: 1.4 }}>
                  <span style={{ display: "block", color: "var(--fg-1)", fontWeight: 500 }}>
                    {TIER_LABEL[tier]}
                  </span>
                  <span className="muted" style={{ fontSize: 10 }}>
                    次回: {nextRefreshLabel(row.status, row.lastDiffAt)}
                  </span>
                </span>
                <select
                  className="select"
                  value={row.status}
                  onChange={(e) => handleStatusChange(row.asin, e.target.value as WatchlistStatus)}
                  style={{ width: 200, height: 30 }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => handleRemove(row.asin)}
                  disabled={pendingAsin === row.asin}
                >
                  削除
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
