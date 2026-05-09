// LLM Provider Adapter。env.llm.provider に応じて実装を切替。
import { env, mockMode } from "@/lib/env";
import { geminiInsight } from "@/lib/llm/gemini";
import { createFallbackInsight } from "@/lib/llm/mock";
import type {
  AsinMetrics,
  CompetitionLevel,
  Decision,
  StrategicInsight,
} from "@/lib/types";

export interface InsightRequest {
  metrics: AsinMetrics;
  decision: Decision;
  competitionLevel: CompetitionLevel;
  summary: string;
  scoreTotal: number;
}

export async function generateInsight(req: InsightRequest): Promise<StrategicInsight> {
  if (mockMode.llm) {
    return createFallbackInsight({
      decision: req.decision,
      category: req.metrics.category,
      brand: req.metrics.brand,
      competitionLevel: req.competitionLevel,
      summary: req.summary,
      reviewCount: req.metrics.reviewCount,
    });
  }

  switch (env.llm.provider) {
    case "gemini":
      return geminiInsight(req);
    case "openai":
    case "anthropic":
      // Step 10+ で各プロバイダ実装を追加。当面は mock + provider タグだけで返す。
      return {
        ...createFallbackInsight({
          decision: req.decision,
          category: req.metrics.category,
          brand: req.metrics.brand,
          competitionLevel: req.competitionLevel,
          summary: req.summary,
          reviewCount: req.metrics.reviewCount,
        }),
        model: `${env.llm.provider}-not-implemented`,
        source: "hybrid",
      };
    default:
      return createFallbackInsight({
        decision: req.decision,
        category: req.metrics.category,
        brand: req.metrics.brand,
        competitionLevel: req.competitionLevel,
        summary: req.summary,
        reviewCount: req.metrics.reviewCount,
      });
  }
}
