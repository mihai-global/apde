"use server";

import { redirect } from "next/navigation";
import { discoverProducts } from "@/lib/integrations";
import { listDictionary, insertDiscoveryRun } from "@/lib/supabase/repositories";

export interface RunDiscoverInput {
  category: string;
  minPrice?: number;
  maxPrice?: number;
  maxReviews?: number;
  limit?: number;
  applyDictionary: boolean;
}

export async function runDiscover(input: RunDiscoverInput) {
  const dictionary = await listDictionary();
  const result = await discoverProducts(input, { dictionary });
  const row = await insertDiscoveryRun({
    category: result.category,
    filters: result.filters,
    generated_keywords: result.keywords,
    candidate_count: result.candidates.length,
    candidates: result.candidates,
    excluded_candidates: result.excluded,
    duration_ms: result.durationMs,
    source: result.source,
  });
  redirect(`/search/${row.id}`);
}
