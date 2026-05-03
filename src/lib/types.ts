export type Decision = "GO" | "CONDITIONAL_GO" | "NO_GO";
export type CompetitionLevel = "LOW" | "MEDIUM" | "HIGH";
export type DataSource = "mock" | "live" | "hybrid";
export type SizeTier = "SMALL_STANDARD" | "LARGE_STANDARD" | "OVERSIZE";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type RuleStatus = "PASS" | "WARN" | "FAIL";

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export interface ProductHistory {
  priceHistory: TimeSeriesPoint[];
  bsrHistory: TimeSeriesPoint[];
  sellerCountHistory: TimeSeriesPoint[];
}

export interface AsinMetrics extends ProductHistory {
  asin: string;
  title: string;
  category: string;
  brand: string;
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

export interface StrategicInsight {
  model: string;
  source: DataSource;
  report: string;
  differentiationIdeas: string[];
  qaSuggestions: string[];
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
  metrics: AsinMetrics;
  insight: StrategicInsight;
  source: DataSource;
  analyzedAt: string;
}

export interface DiscoveryRequest {
  category: string;
  minPrice?: number;
  maxPrice?: number;
  maxReviews?: number;
  limit?: number;
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
  competitionLevel: CompetitionLevel;
  summary: string;
  reasons: string[];
  weightGrams: number;
  grossMarginRate: number;
}

export interface DiscoveryResponse {
  category: string;
  keywords: string[];
  filters: {
    minPrice?: number;
    maxPrice?: number;
    maxReviews?: number;
    limit: number;
  };
  candidates: DiscoveryCandidate[];
  source: DataSource;
  generatedAt: string;
}

export interface AnalyzeRequest {
  asin: string;
  title?: string;
  category?: string;
  brand?: string;
  forceRefresh?: boolean;
  metrics?: Partial<AsinMetrics>;
}

export interface RefreshRequest {
  categories?: string[];
}

export interface RefreshReport {
  categories: string[];
  refreshedItemCount: number;
  durationMs: number;
  source: DataSource;
  previews: Array<{
    category: string;
    topAsin: string;
    topTitle: string;
    topScore: number;
  }>;
  generatedAt: string;
}
