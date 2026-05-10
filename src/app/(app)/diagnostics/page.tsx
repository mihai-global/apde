// 環境診断ページ。
// 1) env / mockMode フラグの可視化
// 2) 当月 API 利用履歴 (Keepa / Gemini etc.)
// 3) 直近の analysis を source 別に集計
// 4) 任意 ASIN に対する Keepa + LLM の即時プローブ
import Link from "next/link";
import { ProbeForm } from "@/components/diagnostics/ProbeForm";
import { Crumbs } from "@/components/shell/Crumbs";
import { env, mockMode } from "@/lib/env";
import { yen } from "@/lib/format";
import { getLastGeminiError } from "@/lib/llm/gemini";
import {
  getCachedKeepa,
  listApiUsageThisMonth,
} from "@/lib/supabase/repositories";
import { getServiceRoleSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface AnalysisSourceCounts {
  live: number;
  hybrid: number;
  mock: number;
}

async function getAnalysisSourceCounts(): Promise<AnalysisSourceCounts> {
  const supabase = getServiceRoleSupabase();
  const counts: AnalysisSourceCounts = { live: 0, hybrid: 0, mock: 0 };
  if (!supabase) return counts;
  const { data, error } = await supabase
    .from("analysis")
    .select("source")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return counts;
  for (const row of data) {
    const s = (row as { source?: string }).source;
    if (s === "live" || s === "hybrid" || s === "mock") counts[s] += 1;
  }
  return counts;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: ok ? "var(--decision-go)" : "var(--decision-no)",
      }}
    />
  );
}

export default async function DiagnosticsPage() {
  const [usage, sourceCounts] = await Promise.all([
    listApiUsageThisMonth(),
    getAnalysisSourceCounts(),
  ]);

  const usageByProvider = new Map<string, { count: number; cost: number; lastAt: string }>();
  for (const row of usage) {
    const cur = usageByProvider.get(row.provider) ?? { count: 0, cost: 0, lastAt: "" };
    cur.count += 1;
    cur.cost += Number(row.cost_estimate ?? 0);
    if (!cur.lastAt || row.occurred_at > cur.lastAt) cur.lastAt = row.occurred_at;
    usageByProvider.set(row.provider, cur);
  }

  const totalCost = Array.from(usageByProvider.values()).reduce((s, v) => s + v.cost, 0);

  // Service Role キーの末尾 4 文字だけ表示 (機密保護)
  const maskKey = (k: string): string => (k ? `…${k.slice(-4)}` : "(unset)");

  // 任意 ASIN の cache 状態 (URL ?asin=B0XXX で渡せる)
  const recentKeepaCache = await getCachedKeepa("B0CXM7K2PQ");
  const lastGeminiError = getLastGeminiError();

  // Keepa トークン残高取得 (/token は 1 トークン消費しない情報専用エンドポイント)
  let keepaTokenStatus: {
    tokensLeft?: number;
    refillRate?: number;
    refillIn?: number;
  } | null = null;
  if (env.keepa.configured) {
    try {
      const res = await fetch(
        `https://api.keepa.com/token?key=${encodeURIComponent(env.keepa.apiKey)}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          tokensLeft?: number;
          refillRate?: number;
          refillIn?: number;
        };
        keepaTokenStatus = data;
      }
    } catch {
      // ignore
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <Crumbs items={[{ label: "ダッシュボード", href: "/" }, { label: "診断" }]} />
        <h1 className="h1">環境診断</h1>
        <p className="muted" style={{ marginTop: 12, fontSize: 14, marginBottom: 32 }}>
          API キーが Vercel に届いているか、Keepa / Gemini が実呼び出しできているかを一覧する管理ページ。
        </p>

        {/* ── Keepa トークン状態 ── */}
        {keepaTokenStatus !== null ? (
          <section style={{ marginBottom: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Keepa トークン状態</div>
            <div
              style={{
                padding: 16,
                border: `1px solid ${
                  (keepaTokenStatus.tokensLeft ?? 0) < 0
                    ? "var(--decision-no)"
                    : (keepaTokenStatus.tokensLeft ?? 0) < 30
                      ? "var(--decision-cond)"
                      : "var(--decision-go)"
                }`,
                background:
                  (keepaTokenStatus.tokensLeft ?? 0) < 0
                    ? "var(--decision-no-bg)"
                    : (keepaTokenStatus.tokensLeft ?? 0) < 30
                      ? "var(--decision-cond-bg)"
                      : "var(--decision-go-bg)",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 24,
              }}
            >
              <div>
                <div className="eyebrow" style={{ fontSize: 10 }}>残トークン</div>
                <div style={{ fontSize: 32, fontWeight: 600, fontFeatureSettings: '"tnum" 1' }}>
                  {keepaTokenStatus.tokensLeft ?? "—"}
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ fontSize: 10 }}>補充レート</div>
                <div style={{ fontSize: 18, fontFeatureSettings: '"tnum" 1' }}>
                  {keepaTokenStatus.refillRate ?? "—"} <span className="muted" style={{ fontSize: 12 }}>tokens / 分</span>
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ fontSize: 10 }}>次回補充まで</div>
                <div style={{ fontSize: 18, fontFeatureSettings: '"tnum" 1' }}>
                  {keepaTokenStatus.refillIn !== undefined
                    ? `${Math.ceil(keepaTokenStatus.refillIn / 1000)}秒`
                    : "—"}
                </div>
              </div>
            </div>
            {(keepaTokenStatus.tokensLeft ?? 0) < 30 ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.7 }}>
                {(keepaTokenStatus.tokensLeft ?? 0) < 0
                  ? "⚠ トークン残高が負です。 Keepa が rate-limit を返すため探索は mock fallback に落ちます。"
                  : "⚠ トークン残高が少なめです。 大規模な探索を回す前に補充を待つことを推奨。"}
                {" 補充レート ≈ 1 token/分 (free-tier) なので、 -10 トークンの状態で +30 まで回復するには ~40 分。"}
                {" 必要なら Keepa の上位プランを検討。"}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ── env フラグ ── */}
        <section style={{ marginBottom: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>環境変数 / mockMode</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>項目</th>
                <th>状態</th>
                <th>値</th>
                <th>影響</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>NEXT_PUBLIC_SUPABASE_URL</td>
                <td><StatusDot ok={!!env.supabase.url} /></td>
                <td className="mono">{env.supabase.url || "(unset)"}</td>
                <td className="muted">未設定なら Auth 不可</td>
              </tr>
              <tr>
                <td>NEXT_PUBLIC_SUPABASE_ANON_KEY</td>
                <td><StatusDot ok={!!env.supabase.anonKey} /></td>
                <td className="mono">{maskKey(env.supabase.anonKey)}</td>
                <td className="muted">ブラウザ Auth で必須</td>
              </tr>
              <tr>
                <td>SUPABASE_SERVICE_ROLE_KEY</td>
                <td><StatusDot ok={!!env.supabase.serviceRoleKey} /></td>
                <td className="mono">{maskKey(env.supabase.serviceRoleKey)}</td>
                <td className="muted">DB 書き込み (analysis / keepa_data)</td>
              </tr>
              <tr>
                <td>KEEPA_API_KEY</td>
                <td><StatusDot ok={env.keepa.configured} /></td>
                <td className="mono">{maskKey(env.keepa.apiKey)}</td>
                <td className="muted">未設定なら Keepa は呼ばれない</td>
              </tr>
              <tr>
                <td>KEEPA_DOMAIN</td>
                <td><StatusDot ok={env.keepa.domain === 5} /></td>
                <td className="mono">{env.keepa.domain} {env.keepa.domain === 5 ? "(Amazon.co.jp)" : "(注意: .co.jp は 5)"}</td>
                <td className="muted">ドメイン違いだと ASIN ヒットしない</td>
              </tr>
              <tr>
                <td>LLM_PROVIDER</td>
                <td><StatusDot ok={env.llm.provider !== "mock"} /></td>
                <td className="mono">{env.llm.provider}</td>
                <td className="muted">mock / 不明値は LLM 呼ばれない</td>
              </tr>
              <tr>
                <td>GEMINI_API_KEY</td>
                <td><StatusDot ok={!!env.llm.geminiApiKey} /></td>
                <td className="mono">{maskKey(env.llm.geminiApiKey)}</td>
                <td className="muted">{env.llm.provider === "gemini" ? "Gemini で必須" : "(provider != gemini なので不要)"}</td>
              </tr>
              <tr>
                <td>CRON_SECRET</td>
                <td><StatusDot ok={!!env.cronSecret} /></td>
                <td className="mono">{maskKey(env.cronSecret)}</td>
                <td className="muted">/api/refresh のシークレット</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <div className="kpi">
              <div className="label">mockMode.supabase</div>
              <div className="val num" style={{ fontSize: 22 }}>{String(mockMode.supabase)}</div>
              <div className="sub">{mockMode.supabase ? "in-memory ストアに書き込み中" : "Supabase 実テーブル"}</div>
            </div>
            <div className="kpi">
              <div className="label">mockMode.keepa</div>
              <div className="val num" style={{ fontSize: 22 }}>{String(mockMode.keepa)}</div>
              <div className="sub">{mockMode.keepa ? "Keepa 呼び出しスキップ" : "実 API"}</div>
            </div>
            <div className="kpi">
              <div className="label">mockMode.llm</div>
              <div className="val num" style={{ fontSize: 22 }}>{String(mockMode.llm)}</div>
              <div className="sub">{mockMode.llm ? "フォールバック洞察" : `${env.llm.provider} 実呼び出し`}</div>
            </div>
          </div>
        </section>

        {/* ── 直近の Gemini エラー (あれば) ── */}
        {lastGeminiError ? (
          <section style={{ marginBottom: 56 }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>直近の Gemini エラー</div>
            <div
              style={{
                padding: 16,
                border: "1px solid var(--decision-no)",
                background: "var(--decision-no-bg)",
                fontSize: 13,
                lineHeight: 1.7,
                fontFamily: "var(--font-mono)",
                wordBreak: "break-word",
              }}
            >
              <div style={{ color: "var(--fg-3)", fontSize: 11, marginBottom: 8 }}>
                {new Date(lastGeminiError.at).toLocaleString("ja-JP")}
              </div>
              <div style={{ color: "var(--decision-no)" }}>{lastGeminiError.message}</div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              ヒント: <code>404 / model not found</code> なら <code>GEMINI_MODEL</code> env を
              <code>gemini-2.0-flash</code> または <code>gemini-1.5-flash</code> に設定。
              <code>PERMISSION_DENIED</code> なら API キーがそのモデルへの権限を持っていません。
              <code>RESOURCE_EXHAUSTED</code> はレート制限/月次クォータです。
            </div>
          </section>
        ) : null}

        {/* ── プローブ ── */}
        <section style={{ marginBottom: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>即時プローブ</div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            ASIN を入力して Keepa + Gemini を 1 回だけ叩き、生レスポンスを表示します。
            キャッシュを使わず常に実呼び出しします (トークン消費あり)。
          </p>
          <ProbeForm />
        </section>

        {/* ── API 利用履歴 ── */}
        <section style={{ marginBottom: 56 }}>
          <div className="rowsplit" style={{ marginBottom: 16 }}>
            <div className="eyebrow">当月 API 利用 (合計 {yen(totalCost)})</div>
            <Link href="/api/usage" className="btn-text blue" target="_blank">JSON</Link>
          </div>
          {usageByProvider.size === 0 ? (
            <div
              style={{
                padding: 16,
                border: "1px solid var(--border-1)",
                color: "var(--decision-no)",
                fontSize: 13,
              }}
            >
              ⚠ 当月の API 利用履歴がありません — 実呼び出しが一度も行われていないか、
              `api_usage` テーブルが空です。Keepa / Gemini が動いていれば最低 1 行は記録されるはずです。
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>プロバイダ</th>
                  <th className="right">呼び出し回数</th>
                  <th className="right">概算コスト</th>
                  <th>最終呼び出し</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(usageByProvider.entries()).map(([provider, stats]) => (
                  <tr key={provider}>
                    <td><strong>{provider}</strong></td>
                    <td className="right num">{stats.count}</td>
                    <td className="right num">{yen(stats.cost)}</td>
                    <td className="num">{stats.lastAt ? new Date(stats.lastAt).toLocaleString("ja-JP") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── analysis source 別 ── */}
        <section style={{ marginBottom: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>直近 50 件の analysis ソース内訳</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <div className="kpi go">
              <div className="label">LIVE</div>
              <div className="val num">{sourceCounts.live}</div>
              <div className="sub">Keepa + LLM 両方実</div>
            </div>
            <div className="kpi cond">
              <div className="label">HYBRID</div>
              <div className="val num">{sourceCounts.hybrid}</div>
              <div className="sub">片方だけ実</div>
            </div>
            <div className="kpi">
              <div className="label">MOCK</div>
              <div className="val num">{sourceCounts.mock}</div>
              <div className="sub">完全モックフォールバック</div>
            </div>
          </div>
        </section>

        {/* ── サンプル ASIN のキャッシュ確認 ── */}
        <section>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Keepa キャッシュ (B0CXM7K2PQ)</div>
          {recentKeepaCache ? (
            <table className="tbl">
              <tbody>
                <tr><td>price_history points</td><td className="num">{recentKeepaCache.price_history.length}</td></tr>
                <tr><td>bsr_history points</td><td className="num">{recentKeepaCache.bsr_history.length}</td></tr>
                <tr><td>seller_history points</td><td className="num">{recentKeepaCache.seller_history.length}</td></tr>
                <tr><td>updated_at</td><td className="num">{new Date(recentKeepaCache.updated_at).toLocaleString("ja-JP")}</td></tr>
                <tr><td>source</td><td>{recentKeepaCache.source}</td></tr>
              </tbody>
            </table>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              キャッシュなし (B0CXM7K2PQ は未取得) — 上のプローブから取得を試せます。
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
