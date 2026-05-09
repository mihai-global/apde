// Browser-side Supabase client. Returns null in mockMode so that callers can fall back gracefully.
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cached: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (!env.supabase.configured) return null;
  if (cached) return cached;
  cached = createBrowserClient(env.supabase.url, env.supabase.anonKey);
  return cached;
}
