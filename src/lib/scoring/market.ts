// market_score: 5 軸スコア + 8 ゲート判定を 1 つの 0-100 値に合成 (要件 v1.1)。
// market_analysis テーブルに永続化され、 /search の DB ソートキーになる。
//
// formula:
//   axis_avg     = mean(demand, competition, profit, stability, differentiation)
//   gates_ratio  = gates_passed / 8
//   axis_weight  = 0.6
//   gates_weight = 0.4
//   raw          = (axis_avg * 0.6) + (gates_ratio * 100 * 0.4)
//
// critical (NO_GO) ゲートが 1 つでも fail なら raw - 30 (下限 0)。
//
// decision:
//   raw >= 70 && 失格ゲート 0  → 'go'
//   raw >= 50 && critical pass → 'cond'
//   else                        → 'no_go'
//
// weight (0.6 / 0.4) は app_settings から override 可能にする余地を残し、定数で書く。
import type { GateResult, MarketDecision, ScoreBreakdown } from "@/lib/types";

const AXIS_WEIGHT = 0.6;
const GATES_WEIGHT = 0.4;
const CRITICAL_FAIL_PENALTY = 30;

export interface ComputeMarketScoreInput {
  /** 5 軸 (各 0-100)。 既存 scoreAsin の breakdown は 0-25 / 0-20 等の異なる上限を持つので、
   * このモジュールに渡す前に正規化済みの 5 軸を組み立てること。 */
  axes: {
    demand: number;
    competition: number;
    profit: number;
    stability: number;
    differentiation: number;
  };
  gates: GateResult[];
}

export interface ComputeMarketScoreResult {
  score: number;        // 0-100, 小数 1 桁
  decision: MarketDecision;
  axisAvg: number;      // 0-100
  gatesPassed: number;  // 0..gates.length
  gatesFailed: string[]; // 失敗ゲートの key
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function computeMarketScore(
  input: ComputeMarketScoreInput,
): ComputeMarketScoreResult {
  const a = input.axes;
  const axisAvg =
    (clamp(a.demand, 0, 100) +
      clamp(a.competition, 0, 100) +
      clamp(a.profit, 0, 100) +
      clamp(a.stability, 0, 100) +
      clamp(a.differentiation, 0, 100)) /
    5;

  const total = input.gates.length || 1;
  const passed = input.gates.filter((g) => g.pass).length;
  const ratio = passed / total;

  let raw = axisAvg * AXIS_WEIGHT + ratio * 100 * GATES_WEIGHT;

  const criticalFail = input.gates.some((g) => !g.pass && g.severity === "NO_GO");
  if (criticalFail) raw = Math.max(raw - CRITICAL_FAIL_PENALTY, 0);

  const score = Math.round(raw * 10) / 10;
  const failedKeys = input.gates.filter((g) => !g.pass).map((g) => g.key);

  let decision: MarketDecision;
  if (score >= 70 && failedKeys.length === 0) decision = "go";
  else if (score >= 50 && !criticalFail) decision = "cond";
  else decision = "no_go";

  return {
    score,
    decision,
    axisAvg: Math.round(axisAvg * 10) / 10,
    gatesPassed: passed,
    gatesFailed: failedKeys,
  };
}

/**
 * 既存 scoreAsin() の breakdown (各軸の生スコア) と AsinMetrics から、
 * market_score 用に 0-100 正規化された 5 軸を構築する。
 *
 * mapping (要件 v1.1 §4.2):
 *   demand          ← estimatedMonthlySales を 0..1500 にクリップ → 0..100 にスケール
 *   competition     ← competitionWindow (0-20) → 0-100 (低レビュー＝高スコア)
 *   profit          ← priceFit (0-25) + grossMarginRate (0..50% → 0..50) を平均 → 0-100
 *   stability       ← priceStability (0-15) → 0-100
 *   differentiation ← oemFeasibility (0-20) → 0-100
 */
export function deriveAxesFromBreakdown(
  breakdown: ScoreBreakdown,
  metrics: { estimatedMonthlySales: number; grossMarginRate: number },
): ComputeMarketScoreInput["axes"] {
  const monthly = clamp(metrics.estimatedMonthlySales, 0, 1500);
  const demand = (monthly / 1500) * 100;

  const competition = (clamp(breakdown.competitionWindow, 0, 20) / 20) * 100;

  const priceFitNorm = (clamp(breakdown.priceFit, 0, 25) / 25) * 100;
  const marginNorm = clamp(metrics.grossMarginRate, 0, 60) * (100 / 60);
  const profit = (priceFitNorm + marginNorm) / 2;

  const stability = (clamp(breakdown.priceStability, 0, 15) / 15) * 100;
  const differentiation = (clamp(breakdown.oemFeasibility, 0, 20) / 20) * 100;

  return {
    demand: Math.round(demand),
    competition: Math.round(competition),
    profit: Math.round(profit),
    stability: Math.round(stability),
    differentiation: Math.round(differentiation),
  };
}
