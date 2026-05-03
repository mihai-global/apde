import { discoveryCache } from "@/lib/cache";
import { discoverProducts } from "@/lib/integrations";
import { DiscoveryRequest } from "@/lib/types";

export const runtime = "nodejs";

function createCacheKey(input: DiscoveryRequest): string {
  return JSON.stringify({
    category: input.category,
    minPrice: input.minPrice ?? null,
    maxPrice: input.maxPrice ?? null,
    maxReviews: input.maxReviews ?? null,
    limit: input.limit ?? 20
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as Partial<DiscoveryRequest>;

  if (!body?.category) {
    return Response.json({ error: "category is required" }, { status: 400 });
  }

  const input: DiscoveryRequest = {
    category: body.category,
    minPrice: body.minPrice,
    maxPrice: body.maxPrice,
    maxReviews: body.maxReviews,
    limit: body.limit
  };

  const cacheKey = createCacheKey(input);
  const cached = discoveryCache.get(cacheKey);
  if (cached) {
    return Response.json({ ...cached, cached: true }, { status: 200 });
  }

  const result = await discoverProducts(input);
  discoveryCache.set(cacheKey, result);

  return Response.json({ ...result, cached: false }, { status: 200 });
}
