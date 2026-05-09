// 環境変数の正規化と mockMode 判定。
// - サーバー側でしか参照してはいけない値を server 名前空間にまとめる。
// - NEXT_PUBLIC_* のみブラウザに露出する。
// - 必須キーが揃わない場合は自動的に mockMode に倒し、Keepa/Gemini/Supabase なしでも UI が動くようにする。
//
// 重要: process.env.SUPABASE_SERVICE_ROLE_KEY はブラウザバンドルでは undefined になるため、
// クライアントから参照される `configured` フラグには含めない。書き込みに必要な service role 用は
// `adminConfigured` で別フラグとして公開する。

const truthy = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ブラウザでも判定可能 (URL + ANON_KEY のみ。Auth + 公開クエリで使う)
const supabasePublicConfigured = truthy(supabaseUrl) && truthy(supabaseAnonKey);
// サーバ専用 (Service Role が必要な書き込み・privileged read で使う)
const supabaseAdminConfigured = supabasePublicConfigured && truthy(supabaseServiceRoleKey);

// 大文字小文字とトリムを許容 (LLM_PROVIDER=Gemini / " gemini " 等で mock に落ちないように)
const llmProviderRaw = (process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase();
const allowedProviders = ["gemini", "openai", "anthropic", "mock"] as const;
type LlmProvider = (typeof allowedProviders)[number];
const llmProvider: LlmProvider = (allowedProviders as readonly string[]).includes(llmProviderRaw)
  ? (llmProviderRaw as LlmProvider)
  : "mock";

const llmKeyConfigured =
  (llmProvider === "gemini" && truthy(process.env.GEMINI_API_KEY)) ||
  (llmProvider === "openai" && truthy(process.env.OPENAI_API_KEY)) ||
  (llmProvider === "anthropic" && truthy(process.env.ANTHROPIC_API_KEY));

// サーバ起動時に一度だけ、なぜ mockMode.llm になったかをログ出力 (診断用)。
// NEXT_PUBLIC_ ではないので server bundle のみ評価される。
if (typeof window === "undefined") {
  if (llmProviderRaw !== llmProvider) {
    console.warn(
      `[apde:env] LLM_PROVIDER="${process.env.LLM_PROVIDER}" は不正な値のため mock に落ちました (許可: ${allowedProviders.join("/")})`,
    );
  } else if (!llmKeyConfigured && llmProvider !== "mock") {
    console.warn(
      `[apde:env] LLM_PROVIDER="${llmProvider}" だが対応する API キーが未設定 (要 ${
        llmProvider === "gemini" ? "GEMINI_API_KEY" : llmProvider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"
      })`,
    );
  }
}

const keepaConfigured = truthy(process.env.KEEPA_API_KEY);

const costBudgetJpy = Number(process.env.COST_BUDGET_JPY ?? 10000);

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  enableTweaks: process.env.NEXT_PUBLIC_ENABLE_TWEAKS === "1",
  supabase: {
    url: supabaseUrl ?? "",
    anonKey: supabaseAnonKey ?? "",
    serviceRoleKey: supabaseServiceRoleKey ?? "",
    configured: supabasePublicConfigured, // ブラウザ Auth が動く水準
    adminConfigured: supabaseAdminConfigured, // 書き込みリポジトリが使える水準
  },
  keepa: {
    apiKey: process.env.KEEPA_API_KEY ?? "",
    configured: keepaConfigured,
    domain: Number(process.env.KEEPA_DOMAIN ?? 5), // 5 = Amazon.co.jp
  },
  llm: {
    provider: llmProvider,
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    configured: llmKeyConfigured,
  },
  cronSecret: process.env.CRON_SECRET ?? "",
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL ?? "",
  costBudgetJpy: Number.isFinite(costBudgetJpy) && costBudgetJpy > 0 ? costBudgetJpy : 10000,
} as const;

export type Env = typeof env;
export type { LlmProvider };

// mockMode: 書き込みストアの切替判定。
// Service Role が無いと Supabase への書き込み (analysis / discovery_runs / api_usage…) ができないため、
// admin が揃っていない場合は in-memory にフォールバックする。
// ※ middleware の auth ガードもこれで bypass されるが、Auth は publicConfigured で動くため
//   「ログインだけ Supabase で行うが書き込みは in-memory」というモードでも実害はない。
const isMockProvider = llmProvider === "mock";

export const mockMode = {
  supabase: !supabaseAdminConfigured,
  keepa: !keepaConfigured,
  llm: isMockProvider || !llmKeyConfigured,
  resolveSource(): "live" | "hybrid" | "mock" {
    const liveCount = [keepaConfigured, llmKeyConfigured, supabaseAdminConfigured].filter(Boolean)
      .length;
    if (liveCount === 3) return "live";
    if (liveCount === 0) return "mock";
    return "hybrid";
  },
} as const;
