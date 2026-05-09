// 強制ゲート評価 (要件 v1.1 §4.3)。スコア計算とは独立に評価し、ヒット時はダウングレード。
import type {
  AsinMetrics,
  Decision,
  GateKey,
  GateResult,
  KeepaDerivedMetrics,
  ProfitBreakdown,
} from "@/lib/types";

export interface GateInput {
  metrics: AsinMetrics;
  derived: KeepaDerivedMetrics;
  profit: ProfitBreakdown;
}

export const GATE_DEFINITIONS: Array<Pick<GateResult, "key" | "name" | "severity">> = [
  { key: "margin", name: "粗利率不足", severity: "NO_GO" },
  { key: "ad", name: "広告耐性不足", severity: "NO_GO" },
  { key: "monthly", name: "月販不足", severity: "CONDITIONAL_CAP" },
  { key: "crash", name: "価格崩壊", severity: "NO_GO" },
  { key: "regulated", name: "規制 / 危険物", severity: "NO_GO" },
  { key: "ip", name: "知財リスク", severity: "NO_GO" },
  { key: "oemHard", name: "OEM再現困難", severity: "CONDITIONAL_CAP" },
  { key: "domination", name: "ブランド支配", severity: "CONDITIONAL_CAP" },
];

export function evaluateGates(input: GateInput): GateResult[] {
  const { metrics, derived, profit } = input;
  const grossMarginPct = profit.sellingPrice
    ? (profit.grossProfit / profit.sellingPrice) * 100
    : 0;
  const adAsGrossPct = profit.grossProfit > 0 ? (profit.adSpendPerUnit / profit.grossProfit) * 100 : 999;

  const definitions: Record<GateKey, { pass: boolean; threshold: string; observed: string }> = {
    margin: {
      pass: grossMarginPct >= 30,
      threshold: "粗利率 ≥ 30%",
      observed: `${grossMarginPct.toFixed(1)}%`,
    },
    ad: {
      pass: adAsGrossPct <= 50,
      threshold: "想定広告費 ≤ 粗利の 50%",
      observed: `広告費 / 粗利 = ${adAsGrossPct.toFixed(0)}%`,
    },
    monthly: {
      pass: metrics.estimatedMonthlySales >= 100,
      threshold: "想定月販 ≥ 100 個",
      observed: `${metrics.estimatedMonthlySales} 個 / 月`,
    },
    crash: {
      // priceDropRate90d はマイナスが下落。-20% 超を NO-GO に。
      pass: derived.priceDropRate90d >= -20,
      threshold: "90 日下落率 ≤ 20%",
      observed: `${derived.priceDropRate90d.toFixed(1)}%`,
    },
    regulated: {
      pass: !metrics.isHazmat && !metrics.isRegulated && metrics.regulatoryRisk !== "HIGH",
      threshold: "規制対象 / 危険物でない",
      observed: metrics.isHazmat
        ? "危険物該当"
        : metrics.isRegulated
          ? "規制カテゴリ該当"
          : metrics.regulatoryRisk === "HIGH"
            ? "規制リスク 高"
            : "問題なし",
    },
    ip: {
      pass: metrics.patentRisk !== "HIGH",
      threshold: "特許 / 商標訴訟事例なし",
      observed: metrics.patentRisk === "HIGH" ? "ヒットあり" : "ヒットなし",
    },
    oemHard: {
      // OEM 適性スコアは 0-20 換算。要件閾値は 5 (粗指標)。
      pass: metrics.oemFeasibility > 25,
      threshold: "OEM適性スコア > 5",
      observed: `OEM ${Math.round(metrics.oemFeasibility / 5)}/20`,
    },
    domination: {
      pass: metrics.brandStrength < 70,
      threshold: "上位3ブランドシェア < 70%",
      observed: `${Math.round(metrics.brandStrength)}%`,
    },
  };

  return GATE_DEFINITIONS.map((def) => ({
    ...def,
    ...definitions[def.key],
  }));
}

export function downgradeByGates(scoreDecision: Decision, gates: GateResult[]): Decision {
  const fails = gates.filter((g) => !g.pass);
  const noGoHit = fails.some((g) => g.severity === "NO_GO");
  if (noGoHit) return "NO_GO";
  const conditionalCapHit = fails.some((g) => g.severity === "CONDITIONAL_CAP");
  if (conditionalCapHit && scoreDecision === "GO") return "CONDITIONAL_GO";
  return scoreDecision;
}

export function decisionFromScore(score: number, gates: GateResult[]): Decision {
  const allPass = gates.every((g) => g.pass);
  if (score >= 75 && allPass) return "GO";
  const noGoHit = gates.some((g) => !g.pass && g.severity === "NO_GO");
  if (noGoHit) return "NO_GO";
  if (score >= 60) return "CONDITIONAL_GO";
  return "NO_GO";
}
