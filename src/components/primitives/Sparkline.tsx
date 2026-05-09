interface SparklineProps {
  values: number[];
  w?: number;
  h?: number;
  neg?: boolean;
}

export function Sparkline({ values, w = 56, h = 24, neg = false }: SparklineProps) {
  if (!values || values.length < 2) {
    return <svg className="spark" aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`)
    .join(" ");
  const color = neg ? "var(--decision-no)" : "var(--fg-1)";
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
