import {
  AnalysisResult,
  AsinMetrics,
  CompetitionLevel,
  Decision,
  RuleCheck,
  ScoreBreakdown,
  StrategicInsight
} from "./types";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round = (value: number): number => Math.round(value * 100) / 100;

function scorePriceFit(input: AsinMetrics): number {
  const price = input.currentPrice;
  if (price < 1500) return 0;
  if (price < 2500) return 8;
  if (price <= 8000) return 25;
  if (price <= 12000) return 16;
  return 8;
}

function scoreSizeEfficiency(input: AsinMetrics): number {
  if (input.weightGrams > 1000 || input.sizeTier === "OVERSIZE") return 0;
  if (input.weightGrams <= 500 && input.sizeTier === "SMALL_STANDARD") return 20;
  if (input.weightGrams <= 800) return 12;
  return 6;
}

function scoreCompetitionWindow(input: AsinMetrics): number {
  const reviewScore =
    input.reviewCount <= 500 ? 10 :
    input.reviewCount <= 1000 ? 5 :
    0;

  const sellerScore =
    input.sellerCount <= 8 ? 5 :
    input.sellerCount <= 12 ? 3 :
    0;

  const brandScore =
    input.brandStrength <= 45 ? 5 :
    input.brandStrength <= 70 ? 2 :
    0;

  return clamp(reviewScore + sellerScore + brandScore, 0, 20);
}

function scorePriceStability(input: AsinMetrics): number {
  const dropScore =
    input.priceDropRate <= 8 ? 9 :
    input.priceDropRate <= 18 ? 6 :
    input.priceDropRate <= 28 ? 3 :
    0;

  const volatilityScore =
    input.bsrVolatility <= 25 ? 4 :
    input.bsrVolatility <= 45 ? 2 :
    0;

  const saleScore =
    input.saleFrequency <= 15 ? 2 :
    input.saleFrequency <= 30 ? 1 :
    0;

  return clamp(dropScore + volatilityScore + saleScore, 0, 15);
}

function scoreOemFeasibility(input: AsinMetrics): number {
  const oemScore = 10 * (clamp(input.oemFeasibility, 0, 100) / 100);
  const diffScore = 6 * (clamp(input.differentiationPotential, 0, 100) / 100);
  const riskPenalty =
    (input.regulatoryRisk === "HIGH" ? 8 : input.regulatoryRisk === "MEDIUM" ? 4 : 0) +
    (input.patentRisk === "HIGH" ? 8 : input.patentRisk === "MEDIUM" ? 4 : 0) +
    (input.complexityRisk === "HIGH" ? 4 : input.complexityRisk === "MEDIUM" ? 2 : 0);

  return clamp(round(oemScore + diffScore - riskPenalty), 0, 20);
}

function competitionLevelFromMetrics(input: AsinMetrics): CompetitionLevel {
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
    input.reviewCount <= 500 && input.brandStrength <= 55 ? "PASS" :
    input.reviewCount <= 1000 && input.brandStrength <= 70 ? "WARN" :
    "FAIL";
  const regulationFail =
    input.regulatoryRisk === "HIGH" || input.patentRisk === "HIGH" || input.complexityRisk === "HIGH";

  return [
    {
      key: "price",
      label: "価格帯",
      status:
        input.currentPrice >= 3000 && input.currentPrice <= 8000 ? "PASS" :
        input.currentPrice >= 1500 && input.currentPrice < 3000 ? "WARN" :
        input.currentPrice > 8000 && input.currentPrice <= 12000 ? "WARN" :
        "FAIL",
      detail:
        input.currentPrice >= 3000 && input.currentPrice <= 8000
          ? "推奨レンジ内です。"
          : input.currentPrice < 1500
            ? "低単価でFBA手数料と広告費を吸収しにくいです。"
            : input.currentPrice < 3000
              ? "成立余地はありますが、軽量・高回転が前提です。"
              : "利益は出せますが、レビューとブランド要求が上がります。"
    },
    {
      key: "size",
      label: "サイズ・重量",
      status:
        input.weightGrams <= 500 && input.sizeTier === "SMALL_STANDARD" ? "PASS" :
        input.weightGrams <= 1000 && input.sizeTier !== "OVERSIZE" ? "WARN" :
        "FAIL",
      detail:
        input.weightGrams <= 500 && input.sizeTier === "SMALL_STANDARD"
          ? "軽量小型でFBA費用に強いです。"
          : input.weightGrams > 1000 || input.sizeTier === "OVERSIZE"
            ? "重量または大型区分でFBAコストが重いです。"
            : "許容範囲ですが、小型軽量ほどの優位はありません。"
    },
    {
      key: "margin",
      label: "粗利率",
      status:
        input.grossMarginRate >= 40 && input.grossMarginRate <= 60 ? "PASS" :
        input.grossMarginRate > 30 ? "WARN" :
        "FAIL",
      detail:
        input.grossMarginRate >= 40 && input.grossMarginRate <= 60
          ? "広告費と返品を吸収しやすい水準です。"
          : input.grossMarginRate <= 30
            ? "粗利30%以下で広告耐性が不足しています。"
            : "成立余地はありますが、運用次第で利益が崩れやすいです。"
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
            : "レビュー過多またはブランド支配で参入難易度が高いです。"
    },
    {
      key: "priceStability",
      label: "価格崩壊",
      status:
        input.priceDropRate <= 12 ? "PASS" :
        input.priceDropRate <= 25 ? "WARN" :
        "FAIL",
      detail:
        input.priceDropRate <= 12
          ? "価格は比較的安定しています。"
          : input.priceDropRate <= 25
            ? "やや値崩れ傾向があり、再確認が必要です。"
            : "価格が右肩下がりで参入後の利益悪化が懸念されます。"
    },
    {
      key: "differentiation",
      label: "差別化余地",
      status:
        input.differentiationPotential >= 65 ? "PASS" :
        input.differentiationPotential >= 40 ? "WARN" :
        "FAIL",
      detail:
        input.differentiationPotential >= 65
          ? "デザイン、セット化、仕様変更で差別化しやすいです。"
          : input.differentiationPotential >= 40
            ? "差別化余地はありますが、訴求軸の設計が必要です。"
            : "コモディティ性が強く、OEM差別化が難しいです。"
    },
    {
      key: "advertising",
      label: "広告耐性",
      status:
        grossProfitPerUnit - adCostPerOrder >= input.currentPrice * 0.1 ? "PASS" :
        grossProfitPerUnit - adCostPerOrder >= 0 ? "WARN" :
        "FAIL",
      detail:
        grossProfitPerUnit - adCostPerOrder >= input.currentPrice * 0.1
          ? "想定CPCでも広告費を吸収しやすいです。"
          : grossProfitPerUnit - adCostPerOrder >= 0
            ? "広告費は吸収できますが、余裕は大きくありません。"
            : "想定CPCに対して広告費負けする可能性が高いです。"
    },
    {
      key: "salesVelocity",
      label: "回転率",
      status:
        input.estimatedMonthlySales >= 100 ? "PASS" :
        input.estimatedMonthlySales >= 60 ? "WARN" :
        "FAIL",
      detail:
        input.estimatedMonthlySales >= 100
          ? "月100個以上が見込め、資金回転に向きます。"
          : input.estimatedMonthlySales >= 60
            ? "成立はしますが、回転率はやや弱めです。"
            : "月販が小さく、キャッシュ回転が遅いです。"
    },
    {
      key: "oem",
      label: "OEM適性",
      status:
        input.oemFeasibility >= 70 && input.complexityRisk === "LOW" ? "PASS" :
        input.oemFeasibility >= 45 ? "WARN" :
        "FAIL",
      detail:
        input.oemFeasibility >= 70 && input.complexityRisk === "LOW"
          ? "工場再現性が高く、小ロット検証に向いています。"
          : input.oemFeasibility >= 45
            ? "OEM化は可能ですが、仕様調整の難易度があります。"
            : "OEM再現性が低く、工場依存または技術難度が高いです。"
    },
    {
      key: "regulatory",
      label: "規制・権利リスク",
      status: regulationFail ? "FAIL" : input.regulatoryRisk === "MEDIUM" || input.patentRisk === "MEDIUM" ? "WARN" : "PASS",
      detail:
        regulationFail
          ? "規制・特許・技術リスクのいずれかが高く、初心者向きではありません。"
          : input.regulatoryRisk === "MEDIUM" || input.patentRisk === "MEDIUM"
            ? "法規・権利の事前調査が必要です。"
            : "大きな規制・権利リスクは低い想定です。"
    }
  ];
}

function summarizeDecision(decision: Decision): string {
  switch (decision) {
    case "GO":
      return "構造条件を複数満たしており、再現性の高い参入候補です。";
    case "CONDITIONAL_GO":
      return "一部条件は良好ですが、落とし穴を潰してから判断すべきです。";
    default:
      return "構造的に勝ちにくく、優先度は低いです。";
  }
}

function buildReasons(input: AsinMetrics, breakdown: ScoreBreakdown, checks: RuleCheck[]): string[] {
  const reasons: string[] = [];

  if (checks.find((item) => item.key === "price")?.status === "PASS") {
    reasons.push("販売価格が¥3,000〜¥8,000帯で、利益と回転のバランスが取りやすいです。");
  }

  if (checks.find((item) => item.key === "size")?.status === "PASS") {
    reasons.push("軽量小型でFBAコストに強く、利益率を守りやすいです。");
  }

  if (checks.find((item) => item.key === "competition")?.status === "PASS") {
    reasons.push("レビューとブランド支配が過度ではなく、中途半端市場を狙えます。");
  }

  if (checks.find((item) => item.key === "differentiation")?.status === "PASS") {
    reasons.push("デザインやセット化など、OEMで差別化できる余地があります。");
  }

  if (checks.find((item) => item.key === "advertising")?.status === "PASS") {
    reasons.push("広告費を吸収できる粗利構造で、拡販時の耐性があります。");
  }

  if (reasons.length === 0 && breakdown.priceFit >= 16) {
    reasons.push("価格条件は大きく外しておらず、改善余地のある商品です。");
  }

  if (reasons.length === 0) {
    reasons.push("一部指標は成立していますが、勝ち筋がはっきりしていません。");
  }

  return reasons.slice(0, 3);
}

function buildRisks(checks: RuleCheck[]): string[] {
  const failures = checks.filter((item) => item.status === "FAIL");
  const warnings = checks.filter((item) => item.status === "WARN");
  const risks = [...failures, ...warnings].map((item) => `${item.label}: ${item.detail}`);

  if (risks.length === 0) {
    risks.push("主要な構造リスクは小さいですが、実データ接続後にKeepaと法規確認は必要です。");
  }

  return risks.slice(0, 3);
}

function buildActions(decision: Decision, checks: RuleCheck[]): string[] {
  const actions: string[] = [];
  const failedKeys = new Set(checks.filter((item) => item.status === "FAIL").map((item) => item.key));

  if (decision === "GO") {
    actions.push("OEM仕様を3案以上出し、差別化要素を先に固定する。");
    actions.push("類似ASINを横比較し、レビュー不満点を訴求に変換する。");
  } else if (decision === "CONDITIONAL_GO") {
    actions.push("WARN項目をKeepaと原価試算で再検証し、失敗条件を潰す。");
  } else {
    actions.push("このASINは保留し、条件を満たす周辺ニッチへ探索を広げる。");
  }

  if (failedKeys.has("margin") || failedKeys.has("advertising")) {
    actions.push("原価、広告CPC、CVRを再試算し、粗利40%以上を確保できるか確認する。");
  }

  if (failedKeys.has("regulatory") || failedKeys.has("oem")) {
    actions.push("法規、特許、工場再現性を先に確認し、難易度が高ければ撤退する。");
  }

  if (actions.length < 3) {
    actions.push("小ロット検証を前提に、価格帯とレビュー帯が近い商品を追加比較する。");
  }

  return actions.slice(0, 3);
}

function decisionFromRules(score: number, checks: RuleCheck[]): Decision {
  const failCount = checks.filter((item) => item.status === "FAIL").length;
  const criticalFail = checks.some(
    (item) =>
      item.status === "FAIL" &&
      (item.key === "margin" ||
        item.key === "advertising" ||
        item.key === "priceStability" ||
        item.key === "regulatory" ||
        item.key === "oem")
  );

  if (criticalFail || failCount >= 3) return "NO_GO";
  if (score >= 80 && failCount === 0) return "GO";
  if (score >= 60) return "CONDITIONAL_GO";
  return "NO_GO";
}

export function createFallbackInsight(result: {
  decision: Decision;
  category: string;
  brand: string;
  competitionLevel: CompetitionLevel;
  summary: string;
}): StrategicInsight {
  const angle =
    result.competitionLevel === "HIGH"
      ? "完全な正面競争を避け、セット化や用途特化へずらす"
      : "使用シーン特化とデザイン改善で差別化する";

  return {
    model: "mock-strategy-engine",
    source: "mock",
    report: `${result.summary} カテゴリ「${result.category}」では、${angle}方針が有効です。ブランド「${result.brand}」が強い場合でも、用途の切り口を狭めれば参入余地を作れます。`,
    differentiationIdeas: [
      "同梱物を再設計して、比較軸自体をずらす",
      "省スペース、時短、持ち運びなど便益を1つに絞る",
      "低評価レビューの不満点を仕様と商品説明に反映する"
    ],
    qaSuggestions: [
      "この商品は¥3,000〜¥8,000帯で利益を維持できるか？",
      "軽量小型のまま差別化できる仕様変更は何か？",
      "レビュー上位商品の弱点を1つだけ突くなら何か？"
    ]
  };
}

export function analyzeAsin(input: AsinMetrics): Omit<AnalysisResult, "insight" | "source" | "analyzedAt"> {
  const breakdown: ScoreBreakdown = {
    priceFit: round(scorePriceFit(input)),
    sizeEfficiency: round(scoreSizeEfficiency(input)),
    competitionWindow: round(scoreCompetitionWindow(input)),
    priceStability: round(scorePriceStability(input)),
    oemFeasibility: round(scoreOemFeasibility(input))
  };

  const score = Math.round(
    breakdown.priceFit +
      breakdown.sizeEfficiency +
      breakdown.competitionWindow +
      breakdown.priceStability +
      breakdown.oemFeasibility
  );

  const ruleChecks = buildRuleChecks(input);
  const decision = decisionFromRules(score, ruleChecks);
  const competitionLevel = competitionLevelFromMetrics(input);
  const summary = summarizeDecision(decision);

  return {
    asin: input.asin,
    title: input.title,
    category: input.category,
    brand: input.brand,
    score,
    decision,
    breakdown,
    summary,
    reasons: buildReasons(input, breakdown, ruleChecks),
    risks: buildRisks(ruleChecks),
    actions: buildActions(decision, ruleChecks),
    competitionLevel,
    monthlyRevenueEstimate: Math.round(input.currentPrice * input.estimatedMonthlySales),
    ruleChecks,
    metrics: input
  };
}
