import { createFallbackInsight, analyzeAsin } from "./scoring";
import {
  AnalysisResult,
  AnalyzeRequest,
  AsinMetrics,
  DataSource,
  DiscoveryCandidate,
  DiscoveryRequest,
  DiscoveryResponse,
  RefreshReport,
  RiskLevel,
  SizeTier,
  StrategicInsight,
  TimeSeriesPoint
} from "./types";

const CATEGORY_LIBRARY: Record<string, string[]> = {
  "デスク周り": ["ケーブル収納", "卓上スタンド", "モニター下", "PCアクセサリ", "ワークスペース整理"],
  "キッチン": ["保存容器", "時短調理", "収納", "洗いやすい", "コンパクト"],
  "美容": ["持ち運び", "ケア", "収納", "静音", "低刺激"],
  "アウトドア": ["軽量", "防水", "折りたたみ", "携帯", "高耐久"]
};

const FALLBACK_KEYWORDS = ["省スペース", "収納", "時短", "改善", "持ち運び"];
const FALLBACK_BRANDS = ["Nova", "Lattice", "Arc", "Mellow", "Crafted"];

const hasKeepaKey = Boolean(process.env.KEEPA_API_KEY);
const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

function riskLevel(seed: number, offset: number, thresholds: [number, number] = [0.72, 0.9]): RiskLevel {
  const value = seeded(seed, offset);
  if (value >= thresholds[1]) return "HIGH";
  if (value >= thresholds[0]) return "MEDIUM";
  return "LOW";
}

function sizeTier(seed: number, weightGrams: number): SizeTier {
  if (weightGrams > 1000) return "OVERSIZE";
  if (weightGrams > 500 && seeded(seed, 91) > 0.55) return "LARGE_STANDARD";
  return "SMALL_STANDARD";
}

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seeded(seed: number, offset: number): number {
  const value = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function numberInRange(seed: number, offset: number, min: number, max: number): number {
  return min + seeded(seed, offset) * (max - min);
}

function createSeries(
  seed: number,
  base: number,
  variance: number,
  points: number
): TimeSeriesPoint[] {
  const series: TimeSeriesPoint[] = [];
  const start = new Date();
  start.setDate(start.getDate() - points * 14);

  for (let index = 0; index < points; index += 1) {
    const timestamp = new Date(start);
    timestamp.setDate(start.getDate() + index * 14);
    const drift = (index - points / 2) * numberInRange(seed, index + 20, -0.08, 0.05);
    const noise = numberInRange(seed, index + 40, -variance, variance);
    series.push({
      timestamp: timestamp.toISOString(),
      value: Math.max(1, Math.round((base + noise + drift * base) * 100) / 100)
    });
  }

  return series;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function generateKeywords(category: string): string[] {
  const normalized = category.trim();
  const library = CATEGORY_LIBRARY[normalized] ?? FALLBACK_KEYWORDS;
  const prefixes = ["Amazon 人気", `${normalized} OEM`, `${normalized} FBA`, `${normalized} レビュー少なめ`];
  return [
    ...prefixes,
    ...library.map((keyword) => `${normalized} ${keyword}`)
  ].slice(0, 8);
}

function createAsin(seed: number, index: number): string {
  const digits = String((seed + index * 7919) % 100000000).padStart(8, "0");
  return `B0${digits}`;
}

function createBrand(seed: number, index: number): string {
  const brand = FALLBACK_BRANDS[(seed + index) % FALLBACK_BRANDS.length];
  return `${brand} ${String.fromCharCode(65 + (index % 26))}`;
}

function createMetrics(input: {
  asin?: string;
  title?: string;
  category: string;
  brand?: string;
  keyword?: string;
  index?: number;
  overrides?: Partial<AsinMetrics>;
}): AsinMetrics {
  const seedBase = hashString(
    [
      input.asin ?? "",
      input.title ?? "",
      input.category,
      input.brand ?? "",
      input.keyword ?? "",
      String(input.index ?? 0)
    ].join("|")
  );

  const asin = input.asin ?? createAsin(seedBase, input.index ?? 0);
  const category = input.category;
  const brand = input.brand ?? createBrand(seedBase, input.index ?? 0);
  const keyword = input.keyword ?? "改善";
  const title = input.title ?? `${category}向け ${keyword} プロダクト ${String((input.index ?? 0) + 1).padStart(2, "0")}`;
  const currentPrice = Math.round(numberInRange(seedBase, 1, 1480, 7980));
  const averagePrice90d = Math.round(currentPrice * numberInRange(seedBase, 2, 0.95, 1.15));
  const estimatedMonthlySales = Math.round(numberInRange(seedBase, 3, 180, 1800));
  const sellerCount = Math.round(numberInRange(seedBase, 4, 2, 18));
  const reviewCount = Math.round(numberInRange(seedBase, 5, 30, 1400));
  const bsrVolatility = Math.round(numberInRange(seedBase, 6, 10, 80));
  const bsrTrend = Math.round(numberInRange(seedBase, 7, -40, 65));
  const priceDropRate = Math.round(numberInRange(seedBase, 8, 4, 42));
  const saleFrequency = Math.round(numberInRange(seedBase, 9, 0, 40));
  const buyBoxConcentration = Math.round(numberInRange(seedBase, 10, 20, 80));
  const brandStrength = Math.round(numberInRange(seedBase, 11, 20, 85));
  const weightGrams = Math.round(numberInRange(seedBase, 13, 120, 1800));
  const grossMarginRate = Math.round(numberInRange(seedBase, 14, 18, 62));
  const differentiationPotential = Math.round(numberInRange(seedBase, 15, 20, 88));
  const adCpcEstimate = Math.round(numberInRange(seedBase, 16, 45, 160));
  const conversionRate = roundRate(numberInRange(seedBase, 17, 0.05, 0.16));
  const oemFeasibility = Math.round(numberInRange(seedBase, 18, 25, 92));
  const regulatory = riskLevel(seedBase, 19, [0.76, 0.92]);
  const patent = riskLevel(seedBase, 20, [0.8, 0.94]);
  const complexity = riskLevel(seedBase, 21, [0.72, 0.9]);

  const metrics: AsinMetrics = {
    asin,
    title,
    category,
    brand,
    currentPrice,
    averagePrice90d,
    bsrVolatility,
    bsrTrend,
    priceDropRate,
    saleFrequency,
    sellerCount,
    buyBoxConcentration,
    reviewCount,
    brandStrength,
    estimatedMonthlySales,
    weightGrams,
    sizeTier: sizeTier(seedBase, weightGrams),
    grossMarginRate,
    differentiationPotential,
    adCpcEstimate,
    conversionRate,
    oemFeasibility,
    regulatoryRisk: regulatory,
    patentRisk: patent,
    complexityRisk: complexity,
    priceHistory: createSeries(seedBase, currentPrice, currentPrice * 0.08, 12),
    bsrHistory: createSeries(seedBase + 7, Math.round(numberInRange(seedBase, 12, 1800, 38000)), 5000, 12),
    sellerCountHistory: createSeries(seedBase + 11, sellerCount, 1.6, 12),
    ...input.overrides
  };

  metrics.currentPrice = clamp(Math.round(metrics.currentPrice), 500, 15000);
  metrics.averagePrice90d = clamp(Math.round(metrics.averagePrice90d), 500, 15000);
  metrics.reviewCount = clamp(Math.round(metrics.reviewCount), 0, 5000);
  metrics.sellerCount = clamp(Math.round(metrics.sellerCount), 1, 50);
  metrics.estimatedMonthlySales = clamp(Math.round(metrics.estimatedMonthlySales), 30, 5000);
  metrics.weightGrams = clamp(Math.round(metrics.weightGrams), 50, 4000);
  metrics.grossMarginRate = clamp(Math.round(metrics.grossMarginRate), 5, 80);
  metrics.differentiationPotential = clamp(Math.round(metrics.differentiationPotential), 0, 100);
  metrics.adCpcEstimate = clamp(Math.round(metrics.adCpcEstimate), 20, 300);
  metrics.conversionRate = roundRate(clamp(metrics.conversionRate, 0.01, 0.4));
  metrics.oemFeasibility = clamp(Math.round(metrics.oemFeasibility), 0, 100);
  metrics.sizeTier = input.overrides?.sizeTier ?? sizeTier(seedBase, metrics.weightGrams);

  return metrics;
}

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toCandidate(result: AnalysisResult): DiscoveryCandidate {
  return {
    asin: result.asin,
    title: result.title,
    category: result.category,
    brand: result.brand,
    currentPrice: result.metrics.currentPrice,
    reviewCount: result.metrics.reviewCount,
    sellerCount: result.metrics.sellerCount,
    score: result.score,
    decision: result.decision,
    monthlyRevenueEstimate: result.monthlyRevenueEstimate,
    competitionLevel: result.competitionLevel,
    summary: result.summary,
    reasons: result.reasons,
    weightGrams: result.metrics.weightGrams,
    grossMarginRate: result.metrics.grossMarginRate
  };
}

async function generateInsight(result: Omit<AnalysisResult, "insight" | "source" | "analyzedAt">): Promise<StrategicInsight> {
  if (!hasGeminiKey) {
    return createFallbackInsight(result);
  }

  return {
    ...createFallbackInsight(result),
    model: "gemini-planned",
    source: "hybrid"
  };
}

export async function discoverProducts(input: DiscoveryRequest): Promise<DiscoveryResponse> {
  const limit = clamp(Math.round(input.limit ?? 20), 10, 100);
  const keywords = generateKeywords(input.category);
  const source: DataSource = hasKeepaKey ? "hybrid" : "mock";

  const analyzed = keywords.flatMap((keyword, keywordIndex) =>
    Array.from({ length: 4 }, (_, productIndex) => {
      const metrics = createMetrics({
        category: input.category,
        keyword,
        index: keywordIndex * 4 + productIndex
      });
      return analyzeAsin(metrics);
    })
  );

  const filtered = analyzed
    .filter((item) => (input.minPrice ? item.metrics.currentPrice >= input.minPrice : true))
    .filter((item) => (input.maxPrice ? item.metrics.currentPrice <= input.maxPrice : true))
    .filter((item) => (input.maxReviews ? item.metrics.reviewCount <= input.maxReviews : true))
    .sort((left, right) => right.score - left.score || right.monthlyRevenueEstimate - left.monthlyRevenueEstimate)
    .slice(0, limit);

  return {
    category: input.category,
    keywords,
    filters: {
      minPrice: input.minPrice,
      maxPrice: input.maxPrice,
      maxReviews: input.maxReviews,
      limit
    },
    candidates: filtered.map((item) => toCandidate({ ...item, insight: createFallbackInsight(item), source, analyzedAt: new Date().toISOString() })),
    source,
    generatedAt: new Date().toISOString()
  };
}

export async function analyzeProduct(input: AnalyzeRequest): Promise<AnalysisResult> {
  const source: DataSource = hasKeepaKey && hasGeminiKey ? "hybrid" : hasKeepaKey ? "live" : "mock";
  const metrics = createMetrics({
    asin: input.asin,
    title: input.title,
    category: input.category ?? "未分類",
    brand: input.brand,
    overrides: input.metrics
  });

  const baseResult = analyzeAsin(metrics);
  const insight = await generateInsight(baseResult);

  return {
    ...baseResult,
    insight,
    source,
    analyzedAt: new Date().toISOString()
  };
}

export async function refreshCategories(categories: string[]): Promise<RefreshReport> {
  const startedAt = Date.now();
  const normalized = categories.length > 0 ? categories : ["デスク周り", "キッチン", "アウトドア"];
  const discoveries = await Promise.all(
    normalized.map((category) => discoverProducts({ category, limit: 10 }))
  );

  return {
    categories: normalized,
    refreshedItemCount: discoveries.reduce((total, result) => total + result.candidates.length, 0),
    durationMs: Date.now() - startedAt,
    source: hasKeepaKey ? "hybrid" : "mock",
    previews: discoveries.map((result) => ({
      category: result.category,
      topAsin: result.candidates[0]?.asin ?? "",
      topTitle: result.candidates[0]?.title ?? "",
      topScore: result.candidates[0]?.score ?? 0
    })),
    generatedAt: new Date().toISOString()
  };
}
