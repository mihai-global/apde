interface ScoreBarProps {
  score: number;
  max?: number;
}

export function ScoreBar({ score, max = 100 }: ScoreBarProps) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, score / max)) : 0;
  // 比率 0.7 以上 = success / 0.4 以上 = warning / それ以下 = danger
  // (合計100点なら 70 以上、軸ごとなら最大値の 70% 以上で緑になるよう統一)
  const tone = ratio >= 0.7 ? "success" : ratio >= 0.4 ? "warning" : "danger";
  return (
    <div className={`scorebar tone-${tone}`}>
      <div className="track">
        <span className="fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="num">{Math.round(score)}</div>
    </div>
  );
}
