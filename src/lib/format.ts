// Format helpers shared across UI / domain layers.
// Mirrors the helpers exposed in the standalone HTML bundle (`window.APDE_DATA`).

export const yen = (value: number): string =>
  `¥${Math.round(value).toLocaleString("ja-JP")}`;

export const fmtNum = (value: number): string => value.toLocaleString("ja-JP");

export const formatPercent = (value: number): string => `${Math.round(value)}%`;

export const formatDate = (value: string | Date): string => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
};

export const formatDateTime = (value: string | Date): string => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDecision = (value: "GO" | "CONDITIONAL_GO" | "NO_GO"): string => {
  if (value === "GO") return "GO";
  if (value === "CONDITIONAL_GO") return "条件付きGO";
  return "NO-GO";
};

export const formatCompetition = (value: "LOW" | "MEDIUM" | "HIGH"): string => {
  if (value === "LOW") return "低";
  if (value === "MEDIUM") return "中";
  return "高";
};

export const formatSizeTier = (value: "SMALL_STANDARD" | "LARGE_STANDARD" | "OVERSIZE"): string => {
  if (value === "SMALL_STANDARD") return "小型";
  if (value === "LARGE_STANDARD") return "標準";
  return "大型";
};
