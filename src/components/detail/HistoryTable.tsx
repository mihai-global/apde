import { DBadge } from "@/components/primitives/DBadge";
import { formatDate } from "@/lib/format";
import type { AnalysisRow } from "@/lib/types";

interface HistoryTableProps {
  rows: AnalysisRow[];
}

export function HistoryTable({ rows }: HistoryTableProps) {
  return (
    <section className="detail-section">
      <div className="section-head">
        <span className="num">07</span>
        <div className="ttl">判断履歴</div>
      </div>
      {rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>過去の判定はまだありません。</div>
      ) : (
        <table className="tbl" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>日付</th>
              <th>判定</th>
              <th>スコア</th>
              <th>変化</th>
              <th>主な要因</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const prev = rows[i + 1];
              const delta = prev ? row.score - prev.score : null;
              return (
                <tr key={row.id}>
                  <td className="num">{formatDate(row.created_at)}</td>
                  <td><DBadge decision={row.decision} /></td>
                  <td className="num">{row.score}</td>
                  <td
                    style={{
                      color: delta == null ? "var(--fg-4)" : delta >= 0 ? "var(--decision-go)" : "var(--decision-no)",
                    }}
                  >
                    {delta == null ? "最新" : `${delta >= 0 ? "+" : ""}${delta}`}
                  </td>
                  <td>{row.summary.slice(0, 32)}…</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
