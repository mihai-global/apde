// 診断用プローブ: 与えた ASIN について Keepa と LLM を 1 回ずつ叩き、結果を JSON で返す。
// キャッシュは使わない (常に実呼び出し)。
import { env, mockMode } from "@/lib/env";
import { fetchKeepaSeries } from "@/lib/keepa/client";
import { generateInsight } from "@/lib/llm";
import { createMockMetrics } from "@/lib/keepa/mock";

export const runtime = "nodejs";

interface ProbeResponse {
  asin: string;
  keepa: {
    ok: boolean;
    error?: string;
    title?: string;
    brand?: string;
    pricePoints: number;
    latestPrice?: number;
    durationMs: number;
  };
  llm: {
    ok: boolean;
    provider: string;
    model: string;
    source: "live" | "hybrid" | "mock";
    sampleReport?: string;
    durationMs: number;
  };
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const asin = (url.searchParams.get("asin") ?? "").trim().toUpperCase();
  if (!/^B0[A-Z0-9]{8}$/.test(asin)) {
    return Response.json({ error: "ASIN looks invalid (expected B0XXXXXXXX)" }, { status: 400 });
  }

  // ── Keepa probe ──
  const keepaStart = Date.now();
  let keepaResult: ProbeResponse["keepa"] = {
    ok: false,
    pricePoints: 0,
    durationMs: 0,
    error: "未実行",
  };
  if (mockMode.keepa) {
    keepaResult = {
      ok: false,
      pricePoints: 0,
      durationMs: 0,
      error: "KEEPA_API_KEY が設定されていません (mockMode.keepa = true)",
    };
  } else {
    try {
      const series = await fetchKeepaSeries(asin);
      keepaResult = {
        ok: true,
        title: series.title,
        brand: series.brand,
        pricePoints: series.price.length,
        latestPrice: series.price.at(-1)?.value,
        durationMs: Date.now() - keepaStart,
      };
    } catch (err) {
      keepaResult = {
        ok: false,
        pricePoints: 0,
        durationMs: Date.now() - keepaStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── LLM probe ──
  const llmStart = Date.now();
  let llmResult: ProbeResponse["llm"] = {
    ok: false,
    provider: env.llm.provider,
    model: "?",
    source: "mock",
    durationMs: 0,
  };
  try {
    const sampleMetrics = createMockMetrics({ asin, category: "テスト" });
    const insight = await generateInsight({
      metrics: sampleMetrics,
      decision: "CONDITIONAL_GO",
      competitionLevel: "MEDIUM",
      summary: "診断プローブ用のサンプル要約",
      scoreTotal: 70,
    });
    llmResult = {
      ok: true,
      provider: env.llm.provider,
      model: insight.model,
      source: insight.source,
      sampleReport: insight.report,
      durationMs: Date.now() - llmStart,
    };
  } catch (err) {
    llmResult = {
      ok: false,
      provider: env.llm.provider,
      model: "error",
      source: "mock",
      durationMs: Date.now() - llmStart,
      sampleReport: err instanceof Error ? err.message : String(err),
    };
  }

  const body: ProbeResponse = { asin, keepa: keepaResult, llm: llmResult };
  return Response.json(body, { status: 200 });
}
