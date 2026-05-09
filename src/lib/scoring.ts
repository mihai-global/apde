// 5軸スコアリング + ルールチェック (要件 v1.1 §4.2)。
// このファイルは純粋関数のみを置く。ゲート判定・利益計算・LLM はそれぞれ別モジュール。
import type {
  AsinMetrics,
  CompetitionLevel,
  RuleCheck,
  ScoreBreakdown,
} from "@/lib/types";

export interface StructuralAnalysis {
  breakdown: ScoreBreakdown;
  score: number; // 0-100
  ruleChecks: RuleCheck[];
  competitionLevel: CompetitionLevel;
  monthlyRevenueEstimate: number;
  reasons: string[];
  risks: string[];
  actions: string[];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round = (value: number): number => Math.round(value * 100) / 100;

function scorePriceFit(input: AsinMetrics): number {
  const price = input.currentPrice;
  if (price < 1500) return 0;
  if (price < 3000) return 15;
  if (price <= 8000) return 25;
  if (price <= 12000) return 15;
  return 5;
}

function scoreSizeEfficiency(input: AsinMetrics): number {
  if (input.weightGrams > 1000 || input.sizeTier === "OVERSIZE") return 0;
  if (input.weightGrams <= 500 && input.sizeTier === "SMALL_STANDARD") return 20;
  return 12;
}

function scoreCompetitionWindow(input: AsinMetrics): number {
  if (input.reviewCount > 1000 || input.brandStrength >= 70) return 0;
  if (input.reviewCount >= 100 && input.reviewCount <= 500 && input.brandStrength < 70) return 20;
  if (input.reviewCount <= 1000) return 10;
  return 0;
}

function scorePriceStability(input: AsinMetrics): number {
  // 90日の変動係数 (CV) は priceDropRate を簡易代替。要件: CV ≤ 0.10 → 15, ≤ 0.20 → 10, ≤ 0.30 → 5。
  const cvProxy = input.priceDropRate / 100; // priceDropRate(%) → 比率に近似
  let stability = 0;
  if (cvProxy <= 0.1) stability = 15;
  else if (cvProxy <= 0.2) stability = 10;
  else if (cvProxy <= 0.3) stability = 5;
  // セール頻度 30% 超で -3
  if (input.saleFrequency >= 30) stability = Math.max(0, stability - 3);
  return stability;
}

function scoreOemFeasibility(input: AsinMetrics): number {
  // 4 観点 0-5 → 合算 (上限 20)
  const reproducibility = input.oemFeasibility >= 70 ? 5 : input.oemFeasibility >= 40 ? 3 : 1;
  const differentiation =
    input.differentiationPotential >= 65 ? 5 : input.differentiationPotential >= 40 ? 3 : 1;
  const complexity =
    input.complexityRisk === "LOW" ? 5 : input.complexityRisk === "MEDIUM" ? 3 : 0;
  const brandIndependence = input.brandStrength < 50 ? 5 : input.brandStrength < 70 ? 3 : 0;
  return clamp(reproducibility + differentiation + complexity + brandIndependence, 0, 20);
}

export function competitionLevelFromMetrics(input: AsinMetrics): CompetitionLevel {
  const pressureIndex =
    input.sellerCount * 2 +
    input.reviewCount / 35 +
    input.brandStrength * 0.35 +
    input.buyBoxConcentration * 0.15;
  if (pressureIndex >= 70) return "HIGH";
  if (pressureIndex >= 40) return "MEDIUM";
  return "LOW";
}

function buildRuleChecks(input: AsinMetrics): RuleCheck[] {
  const adCostPerOrder = input.adCpcEstimate / Math.max(input.conversionRate, 0.01);
  const grossProfitPerUnit = input.currentPrice * (input.grossMarginRate / 100);
  const reviewStatus =
    input.reviewCount <= 500 && input.brandStrength <= 55 ? "PASS"
    : input.reviewCount <= 1000 && input.brandStrength <= 70 ? "WARN"
    : "FAIL";
  const regulationFail =
    input.regulatoryRisk === "HIGH" || input.patentRisk === "HIGH" || input.complexityRisk === "HIGH";
  return [
    {
      key: "price",
      label: "価格帯",
      status:
        input.currentPrice >= 3000 && input.currentPrice <= 8000 ? "PASS"
        : input.currentPrice >= 1500 && input.currentPrice < 3000 ? "WARN"
        : input.currentPrice > 8000 && input.currentPrice <= 12000 ? "WARN"
        : "FAIL",
      detail:
        input.currentPrice >= 3000 && input.currentPrice <= 8000
          ? "推奨レンジ内です。"
          : input.currentPrice < 1500
            ? "低単価で FBA 手数料と広告費を吸収しにくいです。"
            : input.currentPrice < 3000
              ? "成立余地はありますが、軽量・高回転が前提です。"
              : "利益は出せますが、レビューとブランド要求が上がります。",
    },
    {
      key: "size",
      label: "サイズ・重量",
      status:
        input.weightGrams <= 500 && input.sizeTier === "SMALL_STANDARD" ? "PASS"
        : input.weightGrams <= 1000 && input.sizeTier !== "OVERSIZE" ? "WARN"
        : "FAIL",
      detail:
        input.weightGrams <= 500 && input.sizeTier === "SMALL_STANDARD"
          ? "軽量小型で FBA 費用に強いです。"
          : input.weightGrams > 1000 || input.sizeTier === "OVERSIZE"
            ? "重量または大型区分で FBA コストが重いです。"
            : "許容範囲ですが、小型軽量ほどの優位はありません。",
    },
    {
      key: "margin",
      label: "粗利率",
      status:
        input.grossMarginRate >= 40 && input.grossMarginRate <= 60 ? "PASS"
        : input.grossMarginRate > 30 ? "WARN"
        : "FAIL",
      detail:
        input.grossMarginRate >= 40 && input.grossMarginRate <= 60
          ? "広告費と返品を吸収しやすい水準です。"
          : input.grossMarginRate <= 30
            ? "粗利 30% 以下で広告耐性が不足しています。"
            : "成立余地はありますが、運用次第で利益が崩れやすいです。",
    },
    {
      key: "competition",
      label: "競争構造",
      status: reviewStatus,
      detail:
        reviewStatus === "PASS"
          ? "レビューとブランド強度が中程度で狙いやすい市場です。"
          : reviewStatus === "WARN"
            ? "競争は中程度ですが、上位の強さを詳細確認すべきです。"
            : "レビュー過多またはブランド支配で参入難易度が高いです。",
    },
    {
      key: "priceStability",
      label: "価格崩壊",
      status:
        input.priceDropRate <= 12 ? "PASS"
        : input.priceDropRate <= 25 ? "WARN"
        : "FAIL",
      detail:
        input.priceDropRate <= 12
          ? "価格は比較的安定しています。"
          : input.priceDropRate <= 25
            ? "やや値崩れ傾向があり、再確認が必要です。"
            : "価格が右肩下がりで参入後の利益悪化が懸念されます。",
    },
    {
      key: "differentiation",
      label: "差別化余地",
      status:
        input.differentiationPotential >= 65 ? "PASS"
        : input.differentiationPotential >= 40 ? "WARN"
        : "FAIL",
      detail:
        input.differentiationPotential >= 65
          ? "デザイン、セット化、仕様変更で差別化しやすいです。"
          : input.differentiationPotential >= 40
            ? "差別化余地はありますが、訴求軸の設計が必要です。"
            : "コモディティ性が強く、OEM 差別化が難しいです。",
    },
    {
      key: "advertising",
      label: "広告耐性",
      status:
        grossProfitPerUnit - adCostPerOrder >= input.currentPrice * 0.1 ? "PASS"
        : grossProfitPerUnit - adCostPerOrder >= 0 ? "WARN"
        : "FAIL",
      detail:
        grossProfitPerUnit - adCostPerOrder >= input.currentPrice * 0.1
          ? "想定 CPC でも広告費を吸収しやすいです。"
          : grossProfitPerUnit - adCostPerOrder >= 0
            ? "広告費は吸収できますが、余裕は大きくありません。"
            : "想定 CPC に対して広告費負けする可能性が高いです。",
    },
    {
      key: "salesVelocity",
      label: "回転率",
      status:
        input.estimatedMonthlySales >= 100 ? "PASS"
        : input.estimatedMonthlySales >= 60 ? "WARN"
        : "FAIL",
      detail:
        input.estimatedMonthlySales >= 100
          ? "月 100 個以上が見込め、資金回転に向きます。"
          : input.estimatedMonthlySales >= 60
            ? "成立はしますが、回転率はやや弱めです。"
            : "月販が小さく、キャッシュ回転が遅いです。",
    },
    {
      key: "oem",
      label: "OEM 適性",
      status:
        input.oemFeasibility >= 70 && input.complexityRisk === "LOW" ? "PASS"
        : input.oemFeasibility >= 45 ? "WARN"
        : "FAIL",
      detail:
        input.oemFeasibility >= 70 && input.complexityRisk === "LOW"
          ? "工場再現性が高く、小ロット検証に向いています。"
          : input.oemFeasibility >= 45
            ? "OEM 化は可能ですが、仕様調整の難易度があります。"
            : "OEM 再現性が低く、工場依存または技術難度が高いです。",
    },
    {
      key: "regulatory",
      label: "規制・権利リスク",
      status:
        regulationFail ? "FAIL"
        : input.regulatoryRisk === "MEDIUM" || input.patentRisk === "MEDIUM" ? "WARN"
        : "PASS",
      detail:
        regulationFail
          ? "規制・特許・技術リスクのいずれかが高く、初心者向きではありません。"
          : input.regulatoryRisk === "MEDIUM" || input.patentRisk === "MEDIUM"
            ? "法規・権利の事前調査が必要です。"
            : "大きな規制・権利リスクは低い想定です。",
    },
  ];
}

function buildReasons(checks: RuleCheck[]): string[] {
  const reasons: string[] = [];
  if (checks.find((c) => c.key === "price")?.status === "PASS")
    reasons.push("販売価格が ¥3,000〜¥8,000 帯で、利益と回転のバランスが取りやすいです。");
  if (checks.find((c) => c.key === "size")?.status === "PASS")
    reasons.push("軽量小型で FBA コストに強く、利益率を守りやすいです。");
  if (checks.find((c) => c.key === "competition")?.status === "PASS")
    reasons.push("レビューとブランド支配が過度ではなく、中途半端市場を狙えます。");
  if (checks.find((c) => c.key === "differentiation")?.status === "PASS")
    reasons.push("デザインやセット化など、OEM で差別化できる余地があります。");
  if (checks.find((c) => c.key === "advertising")?.status === "PASS")
    reasons.push("広告費を吸収できる粗利構造で、拡販時の耐性があります。");
  if (reasons.length === 0)
    reasons.push("一部指標は成立していますが、勝ち筋がはっきりしていません。");
  return reasons.slice(0, 3);
}

function buildRisks(checks: RuleCheck[]): string[] {
  const failures = checks.filter((c) => c.status === "FAIL");
  const warnings = checks.filter((c) => c.status === "WARN");
  const risks = [...failures, ...warnings].map((c) => `${c.label}: ${c.detail}`);
  if (risks.length === 0)
    risks.push("主要な構造リスクは小さいですが、Keepa と法規確認は必須です。");
  return risks.slice(0, 3);
}

function buildActions(score: number, checks: RuleCheck[]): string[] {
  const actions: string[] = [];
  const failedKeys = new Set(checks.filter((c) => c.status === "FAIL").map((c) => c.key));
  if (score >= 75) {
    actions.push("OEM 仕様を 3 案以上出し、差別化要素を先に固定する。");
    actions.push("類似 ASIN を横比較し、レビュー不満点を訴求に変換する。");
  } else if (score >= 60) {
    actions.push("WARN 項目を Keepa と原価試算で再検証し、失敗条件を潰す。");
  } else {
    actions.push("この ASIN は保留し、条件を満たす周辺ニッチへ探索を広げる。");
  }
  if (failedKeys.has("margin") || failedKeys.has("advertising"))
    actions.push("原価・広告 CPC・CVR を再試算し、粗利 40% 以上を確保できるか確認する。");
  if (failedKeys.has("regulatory") || failedKeys.has("oem"))
    actions.push("法規・特許・工場再現性を先に確認し、難易度が高ければ撤退する。");
  if (actions.length < 3)
    actions.push("小ロット検証を前提に、価格帯とレビュー帯が近い商品を追加比較する。");
  return actions.slice(0, 3);
}

export function scoreAsin(metrics: AsinMetrics): StructuralAnalysis {
  const breakdown: ScoreBreakdown = {
    priceFit: round(scorePriceFit(metrics)),
    sizeEfficiency: round(scoreSizeEfficiency(metrics)),
    competitionWindow: round(scoreCompetitionWindow(metrics)),
    priceStability: round(scorePriceStability(metrics)),
    oemFeasibility: round(scoreOemFeasibility(metrics)),
  };
  const score = Math.round(
    breakdown.priceFit +
      breakdown.sizeEfficiency +
      breakdown.competitionWindow +
      breakdown.priceStability +
      breakdown.oemFeasibility,
  );
  const ruleChecks = buildRuleChecks(metrics);
  return {
    breakdown,
    score,
    ruleChecks,
    competitionLevel: competitionLevelFromMetrics(metrics),
    monthlyRevenueEstimate: Math.round(metrics.currentPrice * metrics.estimatedMonthlySales),
    reasons: buildReasons(ruleChecks),
    risks: buildRisks(ruleChecks),
    actions: buildActions(score, ruleChecks),
  };
}
