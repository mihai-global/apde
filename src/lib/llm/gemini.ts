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

// 2026 以降に発行された AI Studio キーは gemini-1.5-* に到達できないプロジェクトが多く、
// list-models でも 2.0/2.5 系のみ返ってくるケースがある。チェーンは 2.5 → 2.0 を優先。
const DEFAULT_MODEL = "gemini-2.5-flash";

// 最初に成功したモデルを採用。 list-models の典型的な顔ぶれを上から並べている。
const FALLBACK_CHAIN: string[] = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-1.5-flash-latest", // 古いプロジェクト向け最終手段
];

function resolveModelChain(): string[] {
  const override = process.env.GEMINI_MODEL?.trim();
  const chain = override && override.length > 0
    ? [override, ...FALLBACK_CHAIN.filter((m) => m !== override)]
    : FALLBACK_CHAIN;
  // 連続成功キャッシュ: 一度通ったモデルがあればそれを先頭に並べ替え
  const sticky = globalThis.__apdeGeminiStickyModel;
  if (sticky && chain.includes(sticky)) {
    return [sticky, ...chain.filter((m) => m !== sticky)];
  }
  return chain;
}

/**
 * 直近の Gemini 失敗理由を保持する (診断 UI で参照)。
 * Vercel の serverless 関数は短命なのでベストエフォートだが、
 * 一連のリクエスト中なら拾える。
 */
declare global {
  // eslint-disable-next-line no-var
  var __apdeLastGeminiError: { at: string; message: string } | undefined;
  // eslint-disable-next-line no-var
  var __apdeGeminiStickyModel: string | undefined;
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

  const chain = resolveModelChain();
  const prompt = buildInsightPrompt({
    metrics: req.metrics,
    decision: req.decision,
    competitionLevel: req.competitionLevel,
    scoreTotal: req.scoreTotal,
    summary: req.summary,
  });

  const client = new GoogleGenerativeAI(env.llm.geminiApiKey);
  const attempts: Array<{ model: string; message: string }> = [];

  for (const modelName of chain) {
    try {
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
      // 成功したモデルを次回優先するため記憶
      globalThis.__apdeGeminiStickyModel = modelName;
      console.info("[apde:gemini] success", { model: modelName, attempts: attempts.length });
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
      attempts.push({ model: modelName, message });
      console.warn("[apde:gemini] attempt failed", { model: modelName, message });
    }
  }

  // 全モデル失敗 → fallback
  const summary = attempts.map((a) => `${a.model}: ${a.message.slice(0, 80)}`).join(" | ");
  recordError(`all models failed (${chain.length}): ${summary}`);
  return {
    ...fallback,
    model: `gemini-fallback (tried ${chain.length} models): ${summary.slice(0, 280)}`,
    source: "hybrid",
  };
}
