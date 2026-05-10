// 型は要件 v1.1 §8 のテーブル定義と整合させる。
// `lib/scoring.ts` と UI 双方から参照されるため、ここに変更を加える際は両側の影響を確認すること。

export type Decision = "GO" | "CONDITIONAL_GO" | "NO_GO";
export type CompetitionLevel = "LOW" | "MEDIUM" | "HIGH";
export type DataSource = "mock" | "live" | "hybrid";
export type SizeTier = "SMALL_STANDARD" | "LARGE_STANDARD" | "OVERSIZE";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type RuleStatus = "PASS" | "WARN" | "FAIL";

export type WatchlistStatus = "candidate" | "sourcing" | "live";
export type DictionaryType =
  | "exclude_brand"
  | "exclude_category"
  | "promising_keyword"
  | "ng_pattern";
export type FeedbackOutcome = "profitable" | "break_even" | "loss" | "abandoned";
export type ApiProvider = "keepa" | "gemini" | "openai" | "anthropic" | "spapi";

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export interface ProductHistory {
  priceHistory: TimeSeriesPoint[];
  bsrHistory: TimeSeriesPoint[];
  sellerCountHistory: TimeSeriesPoint[];
  buyBoxHistory?: TimeSeriesPoint[];
}

// Keepa から派生する集約指標。
export interface KeepaDerivedMetrics {
  priceCv90d: number; // 変動係数
  saleRatio90d: number; // セール期間比率
  buyBoxConcentration: number; // Buy Box 集中度 (%)
  priceDropRate90d: number; // 90日下落率 (%) — マイナスは下落
}

/** estimatedMonthlySales の出所。 keepa = Keepa monthlySold (実測)、
 * bsr = BSR ベースの粗い推定、seed = mock 乱数 (Keepa 未呼び出し or 失敗) */
export type MonthlySalesSource = "keepa" | "bsr" | "seed";

export interface AsinMetrics extends ProductHistory {
  asin: string;
  title: string;
  category: string;
  brand: string;
  imageUrl?: string;
  rating?: number;
  currentPrice: number;
  averagePrice90d: number;
  bsrVolatility: number;
  bsrTrend: number;
  priceDropRate: number;
  saleFrequency: number;
  sellerCount: number;
  buyBoxConcentration: number;
  reviewCount: number;
  brandStrength: number;
  estimatedMonthlySales: number;
  monthlySalesSource?: MonthlySalesSource;
  weightGrams: number;
  sizeTier: SizeTier;
  grossMarginRate: number;
  differentiationPotential: number;
  adCpcEstimate: number;
  conversionRate: number;
  oemFeasibility: number;
  regulatoryRisk: RiskLevel;
  patentRisk: RiskLevel;
  complexityRisk: RiskLevel;
  isHazmat?: boolean;
  isRegulated?: boolean;
}

export interface ScoreBreakdown {
  priceFit: number;
  sizeEfficiency: number;
  competitionWindow: number;
  priceStability: number;
  oemFeasibility: number;
}

export interface RuleCheck {
  key:
    | "price"
    | "size"
    | "margin"
    | "competition"
    | "priceStability"
    | "differentiation"
    | "advertising"
    | "salesVelocity"
    | "oem"
    | "regulatory";
  label: string;
  status: RuleStatus;
  detail: string;
}

// 強制ゲート (要件 4.3)。スコアと独立に評価し、ヒット時はダウングレード。
export type GateKey =
  | "margin"
  | "ad"
  | "monthly"
  | "crash"
  | "regulated"
  | "ip"
  | "oemHard"
  | "domination";

export interface GateResult {
  key: GateKey;
  name: string;
  pass: boolean;
  threshold: string;
  observed: string;
  severity: "NO_GO" | "CONDITIONAL_CAP";
}

export interface StrategicInsight {
  model: string;
  source: DataSource;
  promptVersion: string;
  report: string;
  differentiationIdeas: string[];
  oemSuggestions: string[];
  reviewInsights: string[];
  qaSuggestions: string[];
}

export interface ProfitBreakdown {
  sellingPrice: number;
  amazonReferralFee: number;
  fbaFee: number;
  cogs: number;
  grossProfit: number;
  adSpendPerUnit: number;
  netProfitPerUnit: number;
  netMarginRate: number;
  netProfitMonthly: number;
  costRate: number;
  cvr: number;
  cpc: number;
}

export interface AnalysisResult {
  asin: string;
  title: string;
  category: string;
  brand: string;
  score: number;
  decision: Decision;
  breakdown: ScoreBreakdown;
  summary: string;
  reasons: string[];
  risks: string[];
  actions: string[];
  competitionLevel: CompetitionLevel;
  monthlyRevenueEstimate: number;
  ruleChecks: RuleCheck[];
  gates: GateResult[];
  metrics: AsinMetrics;
  derived: KeepaDerivedMetrics;
  profit: ProfitBreakdown;
  insight: StrategicInsight;
  source: DataSource;
  analyzedAt: string;
  expiresAt: string;
}

export interface DiscoveryRequest {
  category: string;
  /** 任意キーワード (Keepa /query の title フィルタに使う) */
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
  maxReviews?: number;
  /** Keepa Product Finder の current_REVIEWS_gte に渡す下限 (デフォルト 30) */
  minReviews?: number;
  limit?: number;
  applyDictionary?: boolean;
  forceRefresh?: boolean;
}

export interface ExcludedCandidate {
  asin: string;
  title: string;
  reason: string;
}

export interface DiscoveryCandidate {
  asin: string;
  title: string;
  category: string;
  brand: string;
  currentPrice: number;
  reviewCount: number;
  sellerCount: number;
  score: number;
  decision: Decision;
  monthlyRevenueEstimate: number;
  monthlySalesSource?: MonthlySalesSource;
  competitionLevel: CompetitionLevel;
  summary: string;
  reasons: string[];
  weightGrams: number;
  sizeTier: SizeTier;
  grossMarginRate: number;
  brandStrength: number;
  concern: string;
  rating?: number;
  imageUrl?: string;
}

export interface DiscoveryResponse {
  runId: string;
  category: string;
  /** 後方互換: 旧 5 軸テンプレ。新フローでは `[keyword]` または `[]`。 */
  keywords: string[];
  filters: {
    keyword?: string;
    minPrice?: number;
    maxPrice?: number;
    maxReviews?: number;
    minReviews?: number;
    limit: number;
    applyDictionary: boolean;
  };
  candidates: DiscoveryCandidate[];
  excluded: ExcludedCandidate[];
  source: DataSource;
  durationMs: number;
  generatedAt: string;
}

export interface AnalyzeRequest {
  asin: string;
  title?: string;
  category?: string;
  brand?: string;
  forceRefresh?: boolean;
  metrics?: Partial<AsinMetrics>;
  profitOverrides?: Partial<Pick<ProfitBreakdown, "costRate" | "cvr" | "cpc">>;
}

export interface RefreshRequest {
  categories?: string[];
}

export interface RefreshReport {
  categories: string[];
  refreshedItemCount: number;
  durationMs: number;
  source: DataSource;
  changes: Array<{
    asin: string;
    title: string;
    decisionFrom: Decision;
    decisionTo: Decision;
    scoreDelta: number;
  }>;
  generatedAt: string;
}

// ─── DB エンティティ (Supabase スキーマと 1:1) ─────────────────────────

export interface ProductRow {
  asin: string;
  title: string;
  category: string;
  brand: string | null;
  image_url: string | null;
  current_price: number | null;
  weight_grams: number | null;
  size_tier: SizeTier | null;
  review_count: number;
  seller_count: number;
  brand_strength: number | null;
  rating: number | null;
  is_hazmat: boolean;
  is_regulated: boolean;
  updated_at: string;
}

export interface AnalysisRow {
  id: string;
  asin: string;
  score: number;
  decision: Decision;
  competition_level: CompetitionLevel;
  estimated_monthly_revenue: number;
  breakdown: ScoreBreakdown;
  rule_checks: RuleCheck[];
  gates: GateResult[];
  metrics_snapshot: AsinMetrics;
  derived: KeepaDerivedMetrics;
  profit: ProfitBreakdown;
  summary: string;
  reasons: string[];
  risks: string[];
  actions: string[];
  llm_report: StrategicInsight;
  prompt_version: string;
  source: DataSource;
  created_at: string;
  expires_at: string;
}

export interface DiscoveryRunRow {
  id: string;
  category: string;
  filters: DiscoveryResponse["filters"];
  generated_keywords: string[];
  candidate_count: number;
  candidates: DiscoveryCandidate[];
  excluded_candidates: ExcludedCandidate[];
  duration_ms: number;
  source: DataSource;
  created_at: string;
}

export interface WatchlistRow {
  asin: string;
  status: WatchlistStatus;
  added_at: string;
  user_note: string | null;
  last_change: { decisionFrom?: Decision; decisionTo?: Decision; scoreDelta?: number } | null;
}

export interface DictionaryRow {
  id: string;
  type: DictionaryType;
  value: string;
  note: string | null;
  created_at: string;
}

export interface PurchaseFeedbackRow {
  asin: string;
  purchased_at: string | null;
  outcome: FeedbackOutcome;
  note: string | null;
}

export interface ApiUsageRow {
  id: string;
  provider: ApiProvider;
  endpoint: string;
  cost_estimate: number;
  occurred_at: string;
}

export interface AppSettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface AnalysisThreadRow {
  id: string;
  asin: string;
  prompt: string;
  response: string;
  created_at: string;
}

export interface KeepaDataRow {
  asin: string;
  price_history: TimeSeriesPoint[];
  bsr_history: TimeSeriesPoint[];
  seller_history: TimeSeriesPoint[];
  buy_box_history: TimeSeriesPoint[];
  derived_metrics: KeepaDerivedMetrics;
  source: DataSource;
  updated_at: string;
}

// 互換性 (旧 API レスポンスを構築するための部分型)
export type AnalysisInput = Omit<AnalysisResult, "insight" | "source" | "analyzedAt" | "expiresAt" | "profit" | "derived" | "gates">;
