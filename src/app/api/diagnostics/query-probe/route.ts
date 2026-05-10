// Keepa Product Finder (/query) 単発プローブ。 selection を URL に乗せてレスポンス構造を診断する。
import { env, mockMode } from "@/lib/env";
import { CATEGORIES, findCategory } from "@/lib/keepa/categories";

export const runtime = "nodejs";

interface QueryProbeResult {
  ok: boolean;
  status?: number;
  url?: string;
  durationMs: number;
  responseKeys?: string[];
  productsCount?: number;
  asinListCount?: number;
  totalResults?: number;
  sampleAsins?: string[];
  sampleTitles?: string[];
  tokensConsumed?: number;
  tokensLeft?: number;
  errorMessage?: string;
  rawHead?: string;
  selectionJson?: string;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const categoryParam = url.searchParams.get("category") ?? CATEGORIES[0]!.id;
  const title = url.searchParams.get("title")?.trim() ?? "";
  const minPrice = Number(url.searchParams.get("minPrice") ?? 3000);
  const maxPrice = Number(url.searchParams.get("maxPrice") ?? 8000);

  if (mockMode.keepa) {
    return Response.json(
      { error: "KEEPA_API_KEY が未設定 (mockMode.keepa = true)" },
      { status: 503 },
    );
  }
  const cat = findCategory(categoryParam);
  if (!cat) {
    return Response.json({ error: `Unknown category: ${categoryParam}` }, { status: 400 });
  }

  const selection: Record<string, unknown> = {
    rootCategory: cat.keepaRootCategory,
    productType: [0],
    perPage: 50,
    page: 0,
    sort: [["current_REVIEWS", "desc"]],
    current_AMAZON_gte: minPrice * 100,
    current_AMAZON_lte: maxPrice * 100,
    current_NEW_gte: minPrice * 100,
    current_NEW_lte: maxPrice * 100,
  };
  if (title) selection.title = title;

  const selectionJson = JSON.stringify(selection);
  const apiUrl = `https://api.keepa.com/query?key=${encodeURIComponent(env.keepa.apiKey)}&domain=${env.keepa.domain}&selection=${encodeURIComponent(selectionJson)}`;
  const start = Date.now();

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      const result: QueryProbeResult = {
        ok: false,
        status: res.status,
        url: apiUrl.replace(env.keepa.apiKey, "…REDACTED…"),
        durationMs: Date.now() - start,
        rawHead: text.slice(0, 500),
        errorMessage: "Response is not JSON",
        selectionJson,
      };
      return Response.json(result, { status: 200 });
    }

    const obj = json as Record<string, unknown>;
    const products = Array.isArray(obj.products) ? (obj.products as Array<Record<string, unknown>>) : null;
    const asinList = Array.isArray(obj.asinList) ? (obj.asinList as string[]) : null;

    const sampleAsins: string[] = [];
    const sampleTitles: string[] = [];
    if (products && products.length > 0) {
      for (const p of products.slice(0, 5)) {
        if (typeof p.asin === "string") sampleAsins.push(p.asin);
        if (typeof p.title === "string") sampleTitles.push(p.title.slice(0, 60));
      }
    } else if (asinList) {
      sampleAsins.push(...asinList.slice(0, 5));
    }

    const error = obj.error as { message?: string } | undefined;
    const result: QueryProbeResult = {
      ok: res.ok && (products?.length ?? 0) > 0,
      status: res.status,
      url: apiUrl.replace(env.keepa.apiKey, "…REDACTED…"),
      durationMs: Date.now() - start,
      responseKeys: Object.keys(obj),
      productsCount: products?.length,
      asinListCount: asinList?.length,
      totalResults: typeof obj.totalResults === "number" ? obj.totalResults : undefined,
      sampleAsins,
      sampleTitles,
      tokensConsumed: typeof obj.tokensConsumed === "number" ? obj.tokensConsumed : undefined,
      tokensLeft: typeof obj.tokensLeft === "number" ? obj.tokensLeft : undefined,
      errorMessage: error?.message,
      rawHead: text.slice(0, 800),
      selectionJson,
    };
    return Response.json(result, { status: 200 });
  } catch (err) {
    const result: QueryProbeResult = {
      ok: false,
      url: apiUrl.replace(env.keepa.apiKey, "…REDACTED…"),
      durationMs: Date.now() - start,
      errorMessage: err instanceof Error ? err.message : String(err),
      selectionJson,
    };
    return Response.json(result, { status: 200 });
  }
}
