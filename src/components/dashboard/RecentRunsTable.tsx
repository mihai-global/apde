import { formatDateTime } from "@/lib/format";
import type { DiscoveryRunRow } from "@/lib/types";

interface RecentRunsTableProps {
  runs: Array<
    Pick<
      DiscoveryRunRow,
      "id" | "category" | "generated_keywords" | "candidate_count" | "excluded_candidates" | "duration_ms" | "created_at"
    > & { go_count?: number }
  >;
}

export function RecentRunsTable({ runs }: RecentRunsTableProps) {
  if (runs.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: "16px 0" }}>
        まだ探索ランがありません。
      </div>
    );
  }
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>日時</th>
          <th>カテゴリ</th>
          <th>キーワード</th>
          <th className="right">候補</th>
          <th className="right">除外</th>
          <th className="right">GO</th>
          <th>所要時間</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id}>
            <td className="num">{formatDateTime(run.created_at)}</td>
            <td>{run.category}</td>
            <td className="muted">{run.generated_keywords.length} 件</td>
            <td className="right num">{run.candidate_count}</td>
            <td className="right num" style={{ color: "var(--fg-3)" }}>
              {run.excluded_candidates.length}
            </td>
            <td className="right num">
              <span style={{ color: "var(--decision-go)" }}>{run.go_count ?? 0}</span>
            </td>
            <td className="num">{Math.round(run.duration_ms / 1000)} 秒</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
