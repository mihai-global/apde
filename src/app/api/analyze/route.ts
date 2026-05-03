import { asinAnalysisCache } from "@/lib/cache";
import { analyzeProduct } from "@/lib/integrations";
import { AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as Partial<AnalyzeRequest>;

  if (!body?.asin) {
    return Response.json({ error: "asin is required" }, { status: 400 });
  }

  const cacheKey = body.asin;
  if (!body.forceRefresh) {
    const cached = asinAnalysisCache.get(cacheKey);
    if (cached) {
      return Response.json({ ...cached, cached: true }, { status: 200 });
    }
  }

  const result = await analyzeProduct({
    asin: body.asin,
    title: body.title,
    category: body.category,
    brand: body.brand,
    forceRefresh: body.forceRefresh,
    metrics: body.metrics
  });

  asinAnalysisCache.set(cacheKey, result);
  return Response.json({ ...result, cached: false }, { status: 200 });
}
