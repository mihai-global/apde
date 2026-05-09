// 環境変数の正規化と mockMode 判定。
// - サーバー側でしか参照してはいけない値を server 名前空間にまとめる。
// - NEXT_PUBLIC_* のみブラウザに露出する。
// - 必須キーが揃わない場合は自動的に mockMode に倒し、Keepa/Gemini/Supabase なしでも UI が動くようにする。

const truthy = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseConfigured =
  truthy(supabaseUrl) && truthy(supabaseAnonKey) && truthy(supabaseServiceRoleKey);

const llmProviderRaw = process.env.LLM_PROVIDER ?? "gemini";
const allowedProviders = ["gemini", "openai", "anthropic", "mock"] as const;
type LlmProvider = (typeof allowedProviders)[number];
const llmProvider: LlmProvider = (allowedProviders as readonly string[]).includes(llmProviderRaw)
  ? (llmProviderRaw as LlmProvider)
  : "mock";

const llmKeyConfigured =
  (llmProvider === "gemini" && truthy(process.env.GEMINI_API_KEY)) ||
  (llmProvider === "openai" && truthy(process.env.OPENAI_API_KEY)) ||
  (llmProvider === "anthropic" && truthy(process.env.ANTHROPIC_API_KEY));

const keepaConfigured = truthy(process.env.KEEPA_API_KEY);

const costBudgetJpy = Number(process.env.COST_BUDGET_JPY ?? 10000);

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  enableTweaks: process.env.NEXT_PUBLIC_ENABLE_TWEAKS === "1",
  supabase: {
    url: supabaseUrl ?? "",
    anonKey: supabaseAnonKey ?? "",
    serviceRoleKey: supabaseServiceRoleKey ?? "",
    configured: supabaseConfigured,
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

// mockMode: Supabase の認証情報が揃っていない場合は自動で in-memory にフォールバック。
// Keepa/LLM はそれぞれ単独で mock に倒すため、env.keepa.configured / env.llm.configured を直接参照する。
const isMockProvider = llmProvider === "mock";

export const mockMode = {
  supabase: !supabaseConfigured,
  keepa: !keepaConfigured,
  llm: isMockProvider || !llmKeyConfigured,
  // データソースタグ: hybrid = 一部 live、live = 全 live、mock = 完全 mock
  resolveSource(): "live" | "hybrid" | "mock" {
    const liveCount = [keepaConfigured, llmKeyConfigured, supabaseConfigured].filter(Boolean)
      .length;
    if (liveCount === 3) return "live";
    if (liveCount === 0) return "mock";
    return "hybrid";
  },
} as const;
