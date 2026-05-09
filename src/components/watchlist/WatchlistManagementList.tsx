"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteWatchlist, updateWatchlistStatus } from "@/app/(app)/watchlist/actions";
import { Chip } from "@/components/primitives/Chip";
import { DBadge } from "@/components/primitives/DBadge";
import { ThumbPlaceholder } from "@/components/primitives/ThumbPlaceholder";
import type { Decision, WatchlistStatus } from "@/lib/types";

export interface ManagedWatchlistRow {
  asin: string;
  title: string;
  brand: string;
  status: WatchlistStatus;
  decision: Decision;
  score: number;
  seed: number;
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
          {filtered.map((row) => (
            <div
              key={row.asin}
              className="wrow"
              style={{
                gridTemplateColumns: "48px 1fr auto 200px 80px",
                opacity: pendingAsin === row.asin ? 0.6 : 1,
              }}
            >
              <span className="thumb" style={{ width: 40, height: 40 }}>
                <ThumbPlaceholder seed={row.seed} />
              </span>
              <span>
                <Link href={`/products/${row.asin}`} className="pname">{row.title}</Link>
                <br />
                <span className="pasin">{row.asin} · {row.brand}</span>
              </span>
              <DBadge decision={row.decision} />
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
          ))}
        </div>
      )}
    </>
  );
}
