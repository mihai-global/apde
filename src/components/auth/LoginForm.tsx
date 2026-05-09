"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { AppleIcon, GoogleIcon } from "@/components/primitives/Icon";
import { env } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/browser";

interface LoginFormProps {
  redirectToPromise?: Promise<string | undefined>;
}

export function LoginForm({ redirectToPromise }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("yuki@studio.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function resolveRedirect(): Promise<string> {
    const value = await redirectToPromise?.catch(() => undefined);
    if (typeof value === "string" && value.startsWith("/")) return value;
    return "/";
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const supabase = getBrowserSupabase();
    const target = await resolveRedirect();
    if (!supabase) {
      // mockMode: 直ちにダッシュボードへ
      startTransition(() => {
        router.push(target);
        router.refresh();
      });
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      return;
    }
    startTransition(() => {
      router.push(target);
      router.refresh();
    });
  }

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      const target = await resolveRedirect();
      startTransition(() => {
        router.push(target);
        router.refresh();
      });
      return;
    }
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${env.appUrl}/api/auth/callback` },
    });
    if (authError) setError(authError.message);
  }

  return (
    <form onSubmit={(e) => void handleEmailSignIn(e)}>
      <div className="field">
        <label className="label" htmlFor="login-email">
          メールアドレス
        </label>
        <input
          id="login-email"
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div className="field">
        <label
          className="label"
          htmlFor="login-password"
          style={{ display: "flex", justifyContent: "space-between" }}
        >
          <span>パスワード</span>
          <button type="button" className="btn-text blue" style={{ fontSize: 11 }}>
            忘れた場合
          </button>
        </label>
        <input
          id="login-password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="●●●●●●●●●●"
          autoComplete="current-password"
        />
      </div>
      {error ? (
        <div className="error-banner" role="alert" aria-live="polite">
          {error}
        </div>
      ) : null}
      <button className="submit" type="submit" disabled={pending}>
        {pending ? "サインイン中…" : "サインイン"}
      </button>
      <div className="divider">または</div>
      <div className="oauth">
        <button type="button" onClick={() => void handleOAuth("google")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <GoogleIcon size={14} /> Google
          </span>
        </button>
        <button type="button" onClick={() => void handleOAuth("apple")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <AppleIcon size={14} /> Apple
          </span>
        </button>
      </div>
    </form>
  );
}
