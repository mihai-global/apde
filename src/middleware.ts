// Supabase SSR middleware: 認証セッション cookie を継ぎ足し、(app) ルートを保護する。
// mockMode.supabase = true の場合は完全に無効化。
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, mockMode } from "@/lib/env";

const PUBLIC_PATHS = new Set<string>(["/login"]);
// /api/ingest/*, /api/cron/*, /api/refresh は CRON_SECRET ヘッダで認証するため
// Supabase auth ガードをバイパスする (これを通さないと curl が /login に redirect される)。
const PUBLIC_PREFIXES = [
  "/_next",
  "/api/auth",
  "/api/cron",
  "/api/ingest",
  "/api/refresh",
  "/favicon",
  "/static",
];

export async function middleware(request: NextRequest) {
  // mockMode のときはセッション解決をスキップし、すべての遷移を許可する。
  if (mockMode.supabase) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request });
  const supabase = createServerClient(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set({ name, value, ...options });
        });
      },
    },
  });

  const { pathname } = request.nextUrl;

  // public ルートはバイパス
  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // _next の静的アセット、画像、faviconは除外
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
