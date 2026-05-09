import type { ReactNode } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { getServerSupabase } from "@/lib/supabase/server";
import { mockMode } from "@/lib/env";

function deriveInitials(email: string | null | undefined): string {
  if (!email) return "YS";
  const local = email.split("@")[0] ?? "";
  if (local.length === 0) return "YS";
  return local.slice(0, 2).toUpperCase();
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  let initials = "YS";
  if (!mockMode.supabase) {
    const supabase = await getServerSupabase();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      initials = deriveInitials(user?.email);
    }
  }
  return (
    <>
      <AppHeader userInitials={initials} />
      {children}
    </>
  );
}
