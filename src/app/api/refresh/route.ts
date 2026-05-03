import { refreshCategories } from "@/lib/integrations";
import { RefreshRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Partial<RefreshRequest>;
  const categories = Array.isArray(body.categories) ? body.categories.filter(Boolean) : [];
  const result = await refreshCategories(categories);
  return Response.json(result, { status: 200 });
}
