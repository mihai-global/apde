// Gemini API client (provider-specific implementation).
// Falls back to mock insight on any failure (要件 5.2)。
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { createFallbackInsight } from "@/lib/llm/mock";
import { buildInsightPrompt, REPORT_PROMPT_V } from "@/lib/llm/prompts";
import type { InsightRequest } from "@/lib/llm";
import type { StrategicInsight } from "@/lib/types";
import { usage } from "@/lib/usage/tracker";

interface ParsedInsight {
  report?: unknown;
  differentiationIdeas?: unknown;
  oemSuggestions?: unknown;
  reviewInsights?: unknown;
  qaSuggestions?: unknown;
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const arr = value
    .map((v) => (typeof v === "string" ? v : String(v ?? "")))
    .filter((v) => v.length > 0);
  return arr.length >= 1 ? arr.slice(0, 5) : fallback;
}

export async function geminiInsight(req: InsightRequest): Promise<StrategicInsight> {
  if (!env.llm.geminiApiKey) {
    return {
      ...createFallbackInsight({
        decision: req.decision,
        category: req.metrics.category,
        brand: req.metrics.brand,
        competitionLevel: req.competitionLevel,
        summary: req.summary,
      }),
      model: "gemini-unconfigured",
    };
  }

  const prompt = buildInsightPrompt({
    metrics: req.metrics,
    decision: req.decision,
    competitionLevel: req.competitionLevel,
    scoreTotal: req.scoreTotal,
    summary: req.summary,
  });

  try {
    const client = new GoogleGenerativeAI(env.llm.geminiApiKey);
    const model = client.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    });
    const text = result.response.text();
    const usageMeta = result.response.usageMetadata;
    if (usageMeta) {
      void usage.gemini(
        "models.generateContent",
        usageMeta.promptTokenCount ?? 0,
        usageMeta.candidatesTokenCount ?? 0,
      );
    }
    const parsed = JSON.parse(text) as ParsedInsight;

    const fallback = createFallbackInsight({
      decision: req.decision,
      category: req.metrics.category,
      brand: req.metrics.brand,
      competitionLevel: req.competitionLevel,
      summary: req.summary,
    });

    return {
      model: "gemini-2.5-pro",
      source: "live",
      promptVersion: REPORT_PROMPT_V,
      report: typeof parsed.report === "string" && parsed.report.length > 0 ? parsed.report : fallback.report,
      differentiationIdeas: toStringArray(parsed.differentiationIdeas, fallback.differentiationIdeas),
      oemSuggestions: toStringArray(parsed.oemSuggestions, fallback.oemSuggestions),
      reviewInsights: toStringArray(parsed.reviewInsights, fallback.reviewInsights),
      qaSuggestions: toStringArray(parsed.qaSuggestions, fallback.qaSuggestions),
    };
  } catch (err) {
    console.warn("[apde] gemini insight failed, falling back", err);
    return {
      ...createFallbackInsight({
        decision: req.decision,
        category: req.metrics.category,
        brand: req.metrics.brand,
        competitionLevel: req.competitionLevel,
        summary: req.summary,
      }),
      model: "gemini-fallback",
      source: "hybrid",
    };
  }
}
