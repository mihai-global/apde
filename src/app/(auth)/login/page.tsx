import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "サインイン — APDE",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirectTo?: string }>;
}) {
  return (
    <div className="login-shell">
      <div className="login-side">
        <div className="login-form">
          <div style={{ marginBottom: 56 }}>
            <div
              style={{
                fontFamily: "SST, sans-serif",
                fontWeight: 700,
                letterSpacing: "0.18em",
                fontSize: 16,
              }}
            >
              APDE
            </div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginTop: 4,
              }}
            >
              Amazon Product Discovery Engine
            </div>
          </div>
          <h1 className="h1">サインイン</h1>
          <p className="sub">あなたのリサーチ環境にアクセスします。</p>
          <LoginForm
            redirectToPromise={searchParams?.then((p) => p.redirectTo).catch(() => undefined)}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--fg-4)",
              marginTop: 32,
              lineHeight: 1.6,
            }}
          >
            Powered by Supabase Auth · 個人運用専用
          </div>
        </div>
      </div>
      <div className="login-hero">
        <div className="marks">
          <span>APDE / 2026</span>
          <span>JP</span>
        </div>
        <h2>
          「迷わず捨て、迷わず GO する」
          <br />
          個人物販リサーチの構造化。
        </h2>
      </div>
    </div>
  );
}
