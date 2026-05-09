// LLM 未接続時のフォールバック洞察。標準実装と同じインターフェースで返す。
import type { CompetitionLevel, Decision, StrategicInsight } from "@/lib/types";

export const FALLBACK_PROMPT_VERSION = "report-v1.0-fallback";

export function createFallbackInsight(input: {
  decision: Decision;
  category: string;
  brand: string;
  competitionLevel: CompetitionLevel;
  summary: string;
  reviewCount?: number;
}): StrategicInsight {
  const angle =
    input.competitionLevel === "HIGH"
      ? "完全な正面競争を避け、セット化や用途特化へずらす"
      : "使用シーン特化とデザイン改善で差別化する";
  return {
    model: "mock-strategy-engine",
    source: "mock",
    promptVersion: FALLBACK_PROMPT_VERSION,
    report: `${input.summary} カテゴリ「${input.category}」では、${angle}方針が有効です。ブランド「${input.brand}」が強い場合でも、用途の切り口を狭めれば参入余地を作れます。`,
    differentiationIdeas: [
      "同梱物を再設計して、比較軸自体をずらす",
      "省スペース、時短、持ち運びなど便益を1つに絞る",
      "低評価レビューの不満点を仕様と商品説明に反映する",
    ],
    oemSuggestions: [
      "MOQ 300 個目安 / 単価帯を見越して粗利 40% 以上を確保する",
      "金型不要の素材変更で初期投資を抑える",
      "サンプル → 改善 1〜2 サイクル → 量産の3ステップで進める",
    ],
    reviewInsights: [
      "★1〜★2 レビューに「縫製」「厚み」「匂い」など物理的な不満が現れていないか確認する",
      "上位レビューの褒めポイントを商品説明の冒頭に転記して期待値を整える",
      "レビュー数が少ない競合と並べた相対表で訴求軸を整理する",
    ],
    qaSuggestions: [
      "この商品は ¥3,000〜¥8,000 帯で利益を維持できるか？",
      "軽量小型のまま差別化できる仕様変更は何か？",
      "レビュー上位商品の弱点を 1 つだけ突くなら何か？",
    ],
  };
}
