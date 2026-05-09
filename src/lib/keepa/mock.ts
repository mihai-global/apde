// 決定論的モック生成。標準実装が無いと UI レビュー / オフライン開発ができないため、
// `APDE-standalone.html` の seedKeepa 思想を踏襲した seeded random を提供する。
import type { AsinMetrics, RiskLevel, SizeTier, TimeSeriesPoint } from "@/lib/types";

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function riskLevel(seed: number, offset: number, thresholds: [number, number] = [0.76, 0.92]): RiskLevel {
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

function createSeries(seed: number, base: number, variance: number, points = 12): TimeSeriesPoint[] {
  const series: TimeSeriesPoint[] = [];
  const start = new Date();
  start.setDate(start.getDate() - points * 7);
  for (let i = 0; i < points; i += 1) {
    const ts = new Date(start);
    ts.setDate(start.getDate() + i * 7);
    const drift = (i - points / 2) * numberInRange(seed, i + 20, -0.05, 0.04);
    const noise = numberInRange(seed, i + 40, -variance, variance);
    series.push({
      timestamp: ts.toISOString(),
      value: Math.max(1, Math.round((base + noise + drift * base) * 100) / 100),
    });
  }
  return series;
}

const FALLBACK_BRANDS = ["Nova", "Lattice", "Arc", "Mellow", "Crafted"];

function createAsin(seed: number, index: number): string {
  const digits = String((seed + index * 7919) % 100000000).padStart(8, "0");
  return `B0${digits}`;
}

function createBrand(seed: number, index: number): string {
  return `${FALLBACK_BRANDS[(seed + index) % FALLBACK_BRANDS.length]} ${String.fromCharCode(65 + (index % 26))}`;
}

export interface MockMetricsInput {
  asin?: string;
  title?: string;
  category: string;
  brand?: string;
  keyword?: string;
  index?: number;
  overrides?: Partial<AsinMetrics>;
}

export function createMockMetrics(input: MockMetricsInput): AsinMetrics {
  const seedBase = hashString(
    [input.asin ?? "", input.title ?? "", input.category, input.brand ?? "", input.keyword ?? "", String(input.index ?? 0)].join("|"),
  );
  const asin = input.asin ?? createAsin(seedBase, input.index ?? 0);
  const category = input.category;
  const brand = input.brand ?? createBrand(seedBase, input.index ?? 0);
  const keyword = input.keyword ?? "改善";
  const title =
    input.title ??
    `${category} 向け ${keyword} プロダクト ${String((input.index ?? 0) + 1).padStart(2, "0")}`;
  const currentPrice = clamp(Math.round(numberInRange(seedBase, 1, 1480, 7980)), 500, 15000);
  const averagePrice90d = clamp(
    Math.round(currentPrice * numberInRange(seedBase, 2, 0.95, 1.15)),
    500,
    15000,
  );
  const estimatedMonthlySales = clamp(Math.round(numberInRange(seedBase, 3, 80, 1500)), 30, 5000);
  const sellerCount = clamp(Math.round(numberInRange(seedBase, 4, 2, 18)), 1, 50);
  const reviewCount = clamp(Math.round(numberInRange(seedBase, 5, 30, 1200)), 0, 5000);
  const weightGrams = clamp(Math.round(numberInRange(seedBase, 13, 120, 1800)), 50, 4000);
  const grossMarginRate = clamp(Math.round(numberInRange(seedBase, 14, 18, 62)), 5, 80);

  const metrics: AsinMetrics = {
    asin,
    title,
    category,
    brand,
    rating: Math.round(numberInRange(seedBase, 22, 3.6, 4.8) * 10) / 10,
    currentPrice,
    averagePrice90d,
    bsrVolatility: Math.round(numberInRange(seedBase, 6, 10, 80)),
    bsrTrend: Math.round(numberInRange(seedBase, 7, -40, 65)),
    priceDropRate: Math.round(numberInRange(seedBase, 8, 4, 42)),
    saleFrequency: Math.round(numberInRange(seedBase, 9, 0, 40)),
    sellerCount,
    buyBoxConcentration: Math.round(numberInRange(seedBase, 10, 20, 80)),
    reviewCount,
    brandStrength: Math.round(numberInRange(seedBase, 11, 20, 85)),
    estimatedMonthlySales,
    weightGrams,
    sizeTier: sizeTier(seedBase, weightGrams),
    grossMarginRate,
    differentiationPotential: clamp(Math.round(numberInRange(seedBase, 15, 20, 88)), 0, 100),
    adCpcEstimate: clamp(Math.round(numberInRange(seedBase, 16, 45, 160)), 20, 300),
    conversionRate: Math.round(numberInRange(seedBase, 17, 0.05, 0.16) * 1000) / 1000,
    oemFeasibility: clamp(Math.round(numberInRange(seedBase, 18, 25, 92)), 0, 100),
    regulatoryRisk: riskLevel(seedBase, 19),
    patentRisk: riskLevel(seedBase, 20, [0.8, 0.94]),
    complexityRisk: riskLevel(seedBase, 21),
    isHazmat: false,
    isRegulated: false,
    priceHistory: createSeries(seedBase, currentPrice, currentPrice * 0.06),
    bsrHistory: createSeries(seedBase + 7, Math.round(numberInRange(seedBase, 12, 1800, 38000)), 4500),
    sellerCountHistory: createSeries(seedBase + 11, sellerCount, 1.6),
    buyBoxHistory: createSeries(seedBase + 13, Math.round(numberInRange(seedBase, 10, 20, 80)), 4),
    ...input.overrides,
  };

  return metrics;
}
