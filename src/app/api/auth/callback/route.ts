// Supabase OAuth サインインの code → session 交換ハンドラ。
import { NextResponse, type NextRequest } from "next/server";
import { env, mockMode } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectTo = url.searchParams.get("redirectTo") ?? "/";

  if (!code || mockMode.supabase) {
    return NextResponse.redirect(new URL(redirectTo || "/", env.appUrl));
  }

  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.redirect(new URL(redirectTo || "/", env.appUrl));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const errorUrl = new URL("/login", env.appUrl);
    errorUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(errorUrl);
  }
  return NextResponse.redirect(new URL(redirectTo || "/", env.appUrl));
}
