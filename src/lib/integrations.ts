// 探索 / 分析 / 再評価のオーケストレーション。
// 各ステップは小さなモジュールに分離し、ここでは流れだけを記述する。
import { mockMode } from "@/lib/env";
import { evaluateGates, decisionFromScore, downgradeByGates } from "@/lib/gates";
import { deriveKeepaMetrics } from "@/lib/keepa/derive";
import { createMockMetrics } from "@/lib/keepa/mock";
import { generateKeywords } from "@/lib/keywords/generate";
import { evaluateExclusion, toExcludedCandidate } from "@/lib/exclusion/filter";
import { generateInsight } from "@/lib/llm";
import { computeProfit } from "@/lib/profit";
import { scoreAsin } from "@/lib/scoring";
import type {
  AnalysisResult,
  AnalyzeRequest,
  AsinMetrics,
  DataSource,
  DictionaryRow,
  DiscoveryCandidate,
  DiscoveryRequest,
  DiscoveryResponse,
  ExcludedCandidate,
  RefreshReport,
} from "@/lib/types";

const ANALYSIS_TTL_MS = 24 * 60 * 60 * 1000;

function summarizeDecision(decision: AnalysisResult["decision"]): string {
  switch (decision) {
    case "GO":
      return "推奨価格帯・標準サイズ・適度な競争余地を満たし、全ゲートを合格。OEM での差別化余地も確保できる。";
    case "CONDITIONAL_GO":
      return "市場性は確保できるが、利益または再現性に課題あり。原価交渉・差別化検討の上で採用検討。";
    default:
      return "強制ゲートに抵触または合計スコア不足。仕入れ判断は見送り推奨。";
  }
}

function pickConcern(metrics: AsinMetrics, reasons: string[], risks: string[]): string {
  if (risks.length > 0) return risks[0]!.replace(/^[^:]+:\s*/, "");
  if (reasons.length > 0) return reasons[0]!;
  return `重量 ${metrics.weightGrams}g / レビュー ${metrics.reviewCount} 件で要追跡`;
}

interface AnalyzeOptions {
  metrics: AsinMetrics;
  source: DataSource;
  profitOverrides?: { costRate?: number; cvr?: number; cpc?: number };
}

export async function analyzeMetrics(opts: AnalyzeOptions): Promise<AnalysisResult> {
  const structural = scoreAsin(opts.metrics);
  const profit = computeProfit(opts.metrics, opts.profitOverrides);
  const derived = deriveKeepaMetrics(opts.metrics);
  const gates = evaluateGates({ metrics: opts.metrics, derived, profit });
  const baseDecision = decisionFromScore(structural.score, gates);
  const decision = downgradeByGates(baseDecision, gates);
  const summary = summarizeDecision(decision);

  const insight = await generateInsight({
    metrics: opts.metrics,
    decision,
    competitionLevel: structural.competitionLevel,
    summary,
    scoreTotal: structural.score,
  });

  const now = new Date();
  return {
    asin: opts.metrics.asin,
    title: opts.metrics.title,
    category: opts.metrics.category,
    brand: opts.metrics.brand,
    score: structural.score,
    decision,
    breakdown: structural.breakdown,
    summary,
    reasons: structural.reasons,
    risks: structural.risks,
    actions: structural.actions,
    competitionLevel: structural.competitionLevel,
    monthlyRevenueEstimate: structural.monthlyRevenueEstimate,
    ruleChecks: structural.ruleChecks,
    gates,
    metrics: opts.metrics,
    derived,
    profit,
    insight,
    source: opts.source,
    analyzedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ANALYSIS_TTL_MS).toISOString(),
  };
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
    sizeTier: result.metrics.sizeTier,
    grossMarginRate: result.metrics.grossMarginRate,
    brandStrength: result.metrics.brandStrength,
    rating: result.metrics.rating,
    imageUrl: result.metrics.imageUrl,
    concern: pickConcern(result.metrics, result.reasons, result.risks),
  };
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface DiscoverContext {
  dictionary?: DictionaryRow[];
}

export async function discoverProducts(
  input: DiscoveryRequest,
  ctx: DiscoverContext = {},
): Promise<DiscoveryResponse> {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(input.limit ?? 20, 5), 100);
  const applyDictionary = input.applyDictionary ?? true;
  const { keywords } = generateKeywords(input.category);
  const source = mockMode.resolveSource();
  const dictionary = applyDictionary ? (ctx.dictionary ?? []) : [];

  const generated: AsinMetrics[] = keywords.flatMap((keyword, keywordIndex) =>
    Array.from({ length: 3 }, (_, productIndex) =>
      createMockMetrics({
        category: input.category,
        keyword,
        index: keywordIndex * 3 + productIndex,
      }),
    ),
  );

  // フィルタ + 除外
  const excluded: ExcludedCandidate[] = [];
  const survivors: AsinMetrics[] = [];
  for (const metrics of generated) {
    if (input.minPrice && metrics.currentPrice < input.minPrice) continue;
    if (input.maxPrice && metrics.currentPrice > input.maxPrice) continue;
    if (input.maxReviews && metrics.reviewCount > input.maxReviews) continue;
    const exclusion = evaluateExclusion({ metrics, dictionary });
    if (exclusion.excluded) {
      excluded.push(toExcludedCandidate(metrics, exclusion.reason ?? "除外"));
      continue;
    }
    survivors.push(metrics);
  }

  // 全候補を分析 → ソートして上位 limit を採用
  const analyzed = await Promise.all(
    survivors.map((metrics) => analyzeMetrics({ metrics, source })),
  );
  analyzed.sort((a, b) => b.score - a.score || b.monthlyRevenueEstimate - a.monthlyRevenueEstimate);
  const top = analyzed.slice(0, limit);

  return {
    runId: uuid(),
    category: input.category,
    keywords,
    filters: {
      minPrice: input.minPrice,
      maxPrice: input.maxPrice,
      maxReviews: input.maxReviews,
      limit,
      applyDictionary,
    },
    candidates: top.map(toCandidate),
    excluded,
    source,
    durationMs: Date.now() - startedAt,
    generatedAt: new Date().toISOString(),
  };
}

export async function analyzeProduct(input: AnalyzeRequest): Promise<AnalysisResult> {
  const source = mockMode.resolveSource();
  const metrics = createMockMetrics({
    asin: input.asin,
    title: input.title,
    category: input.category ?? "未分類",
    brand: input.brand,
    overrides: input.metrics,
  });
  return analyzeMetrics({ metrics, source, profitOverrides: input.profitOverrides });
}

export async function refreshCategories(categories: string[]): Promise<RefreshReport> {
  const startedAt = Date.now();
  const normalized = categories.length > 0 ? categories : ["デスク周り", "キッチン", "アウトドア"];
  const discoveries = await Promise.all(normalized.map((category) => discoverProducts({ category, limit: 10 })));

  return {
    categories: normalized,
    refreshedItemCount: discoveries.reduce((total, result) => total + result.candidates.length, 0),
    durationMs: Date.now() - startedAt,
    source: mockMode.resolveSource(),
    changes: [],
    generatedAt: new Date().toISOString(),
  };
}
