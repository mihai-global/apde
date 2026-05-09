interface ScoreBarProps {
  score: number;
  max?: number;
}

export function ScoreBar({ score, max = 100 }: ScoreBarProps) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  // 75+ = success / 60-74 = warning / <60 = danger（GO/CONDITIONAL_GO ゲートと整合）
  const tone = score >= 75 ? "success" : score >= 60 ? "warning" : "danger";
  return (
    <div className={`scorebar tone-${tone}`}>
      <div className="track">
        <span className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="num">{Math.round(score)}</div>
    </div>
  );
}
