import Link from "next/link";
import { DBadge } from "@/components/primitives/DBadge";
import { Thumbnail } from "@/components/primitives/Thumbnail";
import type { Decision, WatchlistStatus } from "@/lib/types";

export interface WatchlistDisplayRow {
  asin: string;
  title: string;
  brand: string;
  status: WatchlistStatus;
  decision: Decision;
  score: number;
  delta: number;
  seed: number;
  imageUrl?: string;
}

interface WatchlistListProps {
  rows: WatchlistDisplayRow[];
}

export function WatchlistList({ rows }: WatchlistListProps) {
  if (rows.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: "16px 0" }}>
        監視中の ASIN はまだありません。
      </div>
    );
  }
  return (
    <div className="wlist">
      {rows.map((row) => (
        <Link key={row.asin} className="wrow" href={`/products/${row.asin}`}>
          <Thumbnail src={row.imageUrl} alt={row.title} seed={row.seed} size={40} />
          <span>
            <span className="pname">{row.title}</span>
            <br />
            <span className="pasin">
              {row.asin} · {row.brand}
            </span>
          </span>
          <DBadge decision={row.decision} />
          <span style={{ fontFeatureSettings: '"tnum" 1', textAlign: "right", minWidth: 64 }}>
            <span className="num" style={{ fontSize: 14 }}>
              {row.score}
            </span>
            <br />
            <span className={row.delta >= 0 ? "delta-up" : "delta-down"}>
              {row.delta >= 0 ? "+" : ""}
              {row.delta}
            </span>
          </span>
          <span className={`stat tone-${row.status}`}>{row.status}</span>
        </Link>
      ))}
    </div>
  );
}
