// LLM プロンプトテンプレート。prompt_version は analysis テーブルに保存し、レポートの再現性を担保する。
import type { AsinMetrics, CompetitionLevel, Decision } from "@/lib/types";

export const REPORT_PROMPT_V = "report-v1.0";

export interface InsightPromptInput {
  metrics: AsinMetrics;
  decision: Decision;
  competitionLevel: CompetitionLevel;
  scoreTotal: number;
  summary: string;
}

export function buildInsightPrompt(input: InsightPromptInput): string {
  const m = input.metrics;
  return [
    `あなたは Amazon FBA / OEM の個人事業者向け仕入れ判断アシスタントです。`,
    `以下の構造化データを踏まえ、4つの観点で分析してください。`,
    "",
    `## 入力`,
    `- ASIN: ${m.asin}`,
    `- 商品名: ${m.title}`,
    `- カテゴリ: ${m.category}`,
    `- ブランド: ${m.brand} (集中度 ${Math.round(m.brandStrength)}%)`,
    `- 価格: ¥${m.currentPrice.toLocaleString("ja-JP")} (90日平均 ¥${m.averagePrice90d.toLocaleString("ja-JP")})`,
    `- 重量: ${m.weightGrams}g / サイズ区分: ${m.sizeTier}`,
    `- レビュー: ${m.reviewCount} 件 (★${m.rating ?? "—"})`,
    `- 出品者数: ${m.sellerCount} / Buy Box 集中度: ${m.buyBoxConcentration}%`,
    `- 想定月販: ${m.estimatedMonthlySales} 個`,
    `- 粗利率: ${m.grossMarginRate}% / OEM 適性: ${m.oemFeasibility}/100`,
    `- 競争レベル: ${input.competitionLevel}`,
    `- 合計スコア: ${input.scoreTotal} / 100`,
    `- 判定: ${input.decision}`,
    `- 構造ルール根拠サマリ: ${input.summary}`,
    "",
    `## 出力 (JSON形式)`,
    `{`,
    `  "report": "150-220 文字で根拠と結論を述べる",`,
    `  "differentiationIdeas": ["...3項目"],`,
    `  "oemSuggestions": ["...3項目"],`,
    `  "reviewInsights": ["...3項目"],`,
    `  "qaSuggestions": ["...3項目の質問例"]`,
    `}`,
    "",
    `※ 経験則ではなく、入力数値の構造的解釈に基づいて記述してください。`,
  ].join("\n");
}
