// Keepa Search API 単発プローブ。 与えた term で生レスポンスを取得し、
// products[] / asinList[] のどちらが返ってくるかを診断する。
import { env, mockMode } from "@/lib/env";

export const runtime = "nodejs";

interface SearchProbeResult {
  ok: boolean;
  status?: number;
  url: string;
  durationMs: number;
  responseKeys?: string[];
  productsCount?: number;
  asinListCount?: number;
  sampleAsins?: string[];
  tokensConsumed?: number;
  tokensLeft?: number;
  rawHead?: string;
  error?: string;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const term = (url.searchParams.get("term") ?? "").trim();
  if (!term) {
    return Response.json({ error: "term required" }, { status: 400 });
  }
  if (mockMode.keepa) {
    return Response.json(
      { error: "KEEPA_API_KEY が未設定 (mockMode.keepa = true)" },
      { status: 503 },
    );
  }

  const apiUrl = `https://api.keepa.com/search?key=${encodeURIComponent(env.keepa.apiKey)}&domain=${env.keepa.domain}&type=product&term=${encodeURIComponent(term)}&page=0`;
  const start = Date.now();

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // 非 JSON
      const result: SearchProbeResult = {
        ok: false,
        status: res.status,
        url: apiUrl.replace(env.keepa.apiKey, "…REDACTED…"),
        durationMs: Date.now() - start,
        rawHead: text.slice(0, 500),
        error: "Response is not JSON",
      };
      return Response.json(result, { status: 200 });
    }

    const obj = json as Record<string, unknown>;
    const products = Array.isArray(obj.products) ? (obj.products as unknown[]) : null;
    const asinList = Array.isArray(obj.asinList) ? (obj.asinList as string[]) : null;

    const sampleAsins: string[] = [];
    if (products && products.length > 0) {
      for (const p of products.slice(0, 5)) {
        if (typeof p === "object" && p !== null && "asin" in p) {
          const asin = (p as { asin?: unknown }).asin;
          if (typeof asin === "string") sampleAsins.push(asin);
        }
      }
    } else if (asinList) {
      sampleAsins.push(...asinList.slice(0, 5));
    }

    const result: SearchProbeResult = {
      ok: res.ok,
      status: res.status,
      url: apiUrl.replace(env.keepa.apiKey, "…REDACTED…"),
      durationMs: Date.now() - start,
      responseKeys: Object.keys(obj),
      productsCount: products?.length,
      asinListCount: asinList?.length,
      sampleAsins,
      tokensConsumed: typeof obj.tokensConsumed === "number" ? obj.tokensConsumed : undefined,
      tokensLeft: typeof obj.tokensLeft === "number" ? obj.tokensLeft : undefined,
      rawHead: text.slice(0, 800),
    };
    return Response.json(result, { status: 200 });
  } catch (err) {
    const result: SearchProbeResult = {
      ok: false,
      url: apiUrl.replace(env.keepa.apiKey, "…REDACTED…"),
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
    return Response.json(result, { status: 200 });
  }
}
