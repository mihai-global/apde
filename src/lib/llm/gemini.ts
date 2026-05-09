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

// 既定モデル: AI Studio の標準 API キー (AIzaSy…) + @google/generative-ai SDK で
// 確実に動く現行モデル。 gemini-2.0-flash は SDK 0.24.x の v1beta パスで 404 を返す
// ことがあるため、デフォルトは 1.5-flash に固定。 gemini-2.5-pro は Vertex/有料向け。
const DEFAULT_MODEL = "gemini-1.5-flash";
function resolveModelName(): string {
  const override = process.env.GEMINI_MODEL?.trim();
  return override && override.length > 0 ? override : DEFAULT_MODEL;
}

/**
 * 直近の Gemini 失敗理由を保持する (診断 UI で参照)。
 * Vercel の serverless 関数は短命なのでベストエフォートだが、
 * 一連のリクエスト中なら拾える。
 */
declare global {
  // eslint-disable-next-line no-var
  var __apdeLastGeminiError: { at: string; message: string } | undefined;
}

function recordError(message: string): void {
  globalThis.__apdeLastGeminiError = { at: new Date().toISOString(), message };
}

export function getLastGeminiError(): { at: string; message: string } | null {
  return globalThis.__apdeLastGeminiError ?? null;
}

function summarizeError(err: unknown): string {
  if (err instanceof Error) {
    // Google SDK は err.message にステータスや理由を含めることが多い
    return err.message.length > 480 ? `${err.message.slice(0, 480)}…` : err.message;
  }
  return String(err);
}

export async function geminiInsight(req: InsightRequest): Promise<StrategicInsight> {
  const fallback = createFallbackInsight({
    decision: req.decision,
    category: req.metrics.category,
    brand: req.metrics.brand,
    competitionLevel: req.competitionLevel,
    summary: req.summary,
  });

  if (!env.llm.geminiApiKey) {
    recordError("GEMINI_API_KEY is not set");
    return { ...fallback, model: "gemini-unconfigured" };
  }

  const modelName = resolveModelName();
  const prompt = buildInsightPrompt({
    metrics: req.metrics,
    decision: req.decision,
    competitionLevel: req.competitionLevel,
    scoreTotal: req.scoreTotal,
    summary: req.summary,
  });

  try {
    const client = new GoogleGenerativeAI(env.llm.geminiApiKey);
    const model = client.getGenerativeModel({ model: modelName });
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
    let parsed: ParsedInsight;
    try {
      parsed = JSON.parse(text) as ParsedInsight;
    } catch (parseErr) {
      throw new Error(`JSON parse failed: ${summarizeError(parseErr)} (raw head: ${text.slice(0, 80)})`);
    }

    return {
      model: modelName,
      source: "live",
      promptVersion: REPORT_PROMPT_V,
      report: typeof parsed.report === "string" && parsed.report.length > 0 ? parsed.report : fallback.report,
      differentiationIdeas: toStringArray(parsed.differentiationIdeas, fallback.differentiationIdeas),
      oemSuggestions: toStringArray(parsed.oemSuggestions, fallback.oemSuggestions),
      reviewInsights: toStringArray(parsed.reviewInsights, fallback.reviewInsights),
      qaSuggestions: toStringArray(parsed.qaSuggestions, fallback.qaSuggestions),
    };
  } catch (err) {
    const message = summarizeError(err);
    console.warn("[apde:gemini] insight failed, falling back", { model: modelName, message });
    recordError(`${modelName}: ${message}`);
    return {
      ...fallback,
      // 診断 UI で見えるようにモデル名にエラー要約を含める
      model: `gemini-fallback (${modelName}: ${message.slice(0, 200)})`,
      source: "hybrid",
    };
  }
}
