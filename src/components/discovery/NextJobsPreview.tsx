// /discovery ページの「次に取得予定 (上位 5 件)」テーブル (Server Component)。
// 既存 .tbl クラス (src/app/globals.css:500+) を流用。

import { fmtNum } from "@/lib/format";
import type { DiscoveryQueueRow } from "@/lib/types";

interface Props {
  jobs: DiscoveryQueueRow[];
}

function formatBand(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  const fmt = (n: number | null): string => (n === null ? "∞" : `¥${n.toLocaleString("ja-JP")}`);
  return `${fmt(min)}–${fmt(max)}`;
}

function formatLastRun(value: string | null): string {
  if (!value) return "未実行";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP");
}

export function NextJobsPreview({ jobs }: Props) {
  if (jobs.length === 0) {
    return (
      <div
        className="muted"
        style={{
          padding: 16,
          fontSize: 13,
          border: "1px solid var(--border-1)",
          background: "var(--bg-2)",
        }}
      >
        キューが空です。 /diagnostics の「シードを投入」ボタンで補充できます。
      </div>
    );
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th style={{ width: 40 }}>#</th>
          <th>カテゴリ</th>
          <th>価格帯</th>
          <th>状態</th>
          <th>最終実行</th>
          <th className="right">試行回数</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {jobs.map((job, idx) => {
          const isNext = idx === 0;
          const rowStyle = isNext
            ? { background: "var(--bg-2)", cursor: "default" as const }
            : { cursor: "default" as const };
          return (
            <tr key={job.id} style={rowStyle}>
              <td className="num">{idx + 1}</td>
              <td>
                <strong>{job.category}</strong>
              </td>
              <td className="num">{formatBand(job.min_price, job.max_price)}</td>
              <td>
                <span
                  className="tag"
                  style={{
                    fontSize: 11,
                    textTransform: "lowercase",
                    color:
                      job.status === "done"
                        ? "var(--decision-go)"
                        : job.status === "running"
                          ? "var(--decision-cond)"
                          : job.status === "failed"
                            ? "var(--decision-no)"
                            : "var(--fg-3)",
                  }}
                >
                  {job.status}
                </span>
              </td>
              <td className="num">{formatLastRun(job.last_run_at)}</td>
              <td className="right num">
                {fmtNum(job.attempts)}/5
              </td>
              <td className="right">
                {isNext ? (
                  <span
                    className="eyebrow"
                    style={{
                      fontSize: 10,
                      color: "var(--decision-cond)",
                      letterSpacing: "0.14em",
                    }}
                  >
                    ← 次に発火
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
