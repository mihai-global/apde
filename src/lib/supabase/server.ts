// Server-side Supabase client.
// Uses cookies for the user session, service-role key for privileged repository operations.
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!env.supabase.configured) return null;
  const cookieStore = await cookies();
  return createServerClient(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignored: this can happen in Server Components where cookies are read-only.
        }
      },
    },
  });
}

let cachedAdmin: SupabaseClient | null = null;
export function getServiceRoleSupabase(): SupabaseClient | null {
  if (!env.supabase.adminConfigured) return null;
  if (cachedAdmin) return cachedAdmin;
  cachedAdmin = createSupabaseClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}
