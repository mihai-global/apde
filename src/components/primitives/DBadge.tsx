import type { Decision } from "@/lib/types";
import { formatDecision } from "@/lib/format";

export type DBadgeStyle = "pill" | "tag" | "dot" | "square";

interface DBadgeProps {
  decision: Decision;
  style?: DBadgeStyle;
  size?: "lg";
}

const TONE: Record<Decision, "go" | "cond" | "no"> = {
  GO: "go",
  CONDITIONAL_GO: "cond",
  NO_GO: "no",
};

export function DBadge({ decision, style = "pill", size }: DBadgeProps) {
  const tone = TONE[decision];
  const label = formatDecision(decision);
  const cls = `dbadge style-${style} tone-${tone}${size ? ` size-${size}` : ""}`;
  if (style === "pill" || style === "dot") {
    return (
      <span className={cls}>
        <span className="dot" />
        {label}
      </span>
    );
  }
  return <span className={cls}>{label}</span>;
}
