// 探索 / 分析 / 再評価のオーケストレーション。
// 各ステップは小さなモジュールに分離し、ここでは流れだけを記述する。
import { mockMode } from "@/lib/env";
import { evaluateGates, decisionFromScore, downgradeByGates } from "@/lib/gates";
import { fetchKeepaSeries, searchKeepa, type KeepaSearchHit, type KeepaSeries } from "@/lib/keepa/client";
import { deriveKeepaMetrics } from "@/lib/keepa/derive";
import { createMockMetrics } from "@/lib/keepa/mock";
import { generateKeywords } from "@/lib/keywords/generate";
import { evaluateExclusion, toExcludedCandidate } from "@/lib/exclusion/filter";
import { generateInsight } from "@/lib/llm";
import { computeProfit } from "@/lib/profit";
import { scoreAsin } from "@/lib/scoring";
import {
  getCachedKeepa,
  upsertKeepaCache,
  upsertProductMaster,
} from "@/lib/supabase/repositories";
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
  KeepaDataRow,
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

function determineSource(keepaLive: boolean, llmLive: boolean): DataSource {
  const liveCount = [keepaLive, llmLive].filter(Boolean).length;
  if (liveCount === 2) return "live";
  if (liveCount === 0) return "mock";
  return "hybrid";
}

/**
 * Keepa の実時系列をモック由来の AsinMetrics に上書きマージする。
 * 1) 24h キャッシュ (keepa_data) を優先
 * 2) ミス時は Keepa を呼び、結果を products / keepa_data に保存
 * 3) 失敗 (mockMode / fake ASIN / API 失敗) はモックのまま返す
 */
async function tryEnrichWithKeepa(
  metrics: AsinMetrics,
): Promise<{ metrics: AsinMetrics; live: boolean }> {
  if (mockMode.keepa) {
    console.info("[apde:keepa] mockMode (KEEPA_API_KEY missing) — using mock");
    return { metrics, live: false };
  }

  // まずキャッシュ確認 (キャッシュは price_history が空なら無効扱い)
  const cached = await getCachedKeepa(metrics.asin);
  const cacheUsable = cached && cached.price_history.length > 0;
  let series: KeepaSeries | null = null;
  let titleFromKeepa: string | undefined;
  let brandFromKeepa: string | undefined;
  let categoryFromKeepa: string | undefined;
  let imageUrlFromKeepa: string | undefined;

  if (cacheUsable) {
    series = {
      price: cached.price_history,
      bsr: cached.bsr_history,
      sellers: cached.seller_history,
      buyBox: cached.buy_box_history,
      reviewCount: [],
      rating: [],
    };
    console.info("[apde:keepa] cache hit", {
      asin: metrics.asin,
      pricePoints: series.price.length,
      cachedAt: cached.updated_at,
    });
  } else {
    try {
      console.info("[apde:keepa] fetching live", { asin: metrics.asin });
      series = await fetchKeepaSeries(metrics.asin);
      titleFromKeepa = series.title;
      brandFromKeepa = series.brand;
      categoryFromKeepa = series.category;
      imageUrlFromKeepa = series.imageUrl;
      console.info("[apde:keepa] live fetch ok", {
        asin: metrics.asin,
        pricePoints: series.price.length,
        title: series.title?.slice(0, 30),
      });

      if (series.price.length === 0) {
        // 商品はあるが履歴空 — キャッシュせず mock にフォールバック (要件 5.2 部分結果)
        console.warn("[apde:keepa] live returned no price history; not caching", { asin: metrics.asin });
        return { metrics, live: false };
      }

      // 24h キャッシュ
      const row: KeepaDataRow = {
        asin: metrics.asin,
        price_history: series.price,
        bsr_history: series.bsr,
        seller_history: series.sellers,
        buy_box_history: series.buyBox,
        derived_metrics: {
          priceCv90d: 0,
          saleRatio90d: 0,
          buyBoxConcentration: 0,
          priceDropRate90d: 0,
        },
        source: "live",
        updated_at: new Date().toISOString(),
      };
      // FK 制約があるため、まず products に最低限の行を upsert
      await upsertProductMaster({
        asin: metrics.asin,
        title: titleFromKeepa,
        brand: brandFromKeepa,
        category: categoryFromKeepa,
        image_url: imageUrlFromKeepa ?? null,
        current_price: series.price.at(-1)?.value,
        seller_count: series.sellers.at(-1)?.value
          ? Math.round(series.sellers.at(-1)!.value)
          : undefined,
        review_count: series.reviewCount.at(-1)?.value
          ? Math.round(series.reviewCount.at(-1)!.value)
          : undefined,
        rating: series.rating.at(-1)?.value
          ? series.rating.at(-1)!.value / 10
          : undefined,
      });
      await upsertKeepaCache(row);
    } catch (err) {
      console.warn("[apde:keepa] enrich failed; keeping mock", {
        asin: metrics.asin,
        err: err instanceof Error ? err.message : String(err),
      });
      return { metrics, live: false };
    }
  }

  if (!series || series.price.length === 0) {
    return { metrics, live: false };
  }

  const enriched: AsinMetrics = { ...metrics };
  enriched.priceHistory = series.price;
  if (series.bsr.length > 0) enriched.bsrHistory = series.bsr;
  if (series.sellers.length > 0) {
    enriched.sellerCountHistory = series.sellers;
    const lastSellers = series.sellers.at(-1)!.value;
    enriched.sellerCount = Math.max(1, Math.round(lastSellers));
  }
  if (series.buyBox.length > 0) enriched.buyBoxHistory = series.buyBox;

  const last = series.price.at(-1)!.value;
  const first = series.price.at(0)!.value;
  const avg = series.price.reduce((s, p) => s + p.value, 0) / series.price.length;
  enriched.currentPrice = Math.round(last);
  enriched.averagePrice90d = Math.round(avg);
  const drop = first > 0 ? ((first - last) / first) * 100 : 0;
  enriched.priceDropRate = Math.max(0, Math.round(drop));

  if (titleFromKeepa) enriched.title = titleFromKeepa;
  if (brandFromKeepa) enriched.brand = brandFromKeepa;
  if (categoryFromKeepa) enriched.category = categoryFromKeepa;
  if (imageUrlFromKeepa) enriched.imageUrl = imageUrlFromKeepa;

  return { metrics: enriched, live: true };
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

/**
 * Keepa Search で得た hit を AsinMetrics に流し込むためのシード生成。
 * フィールドはほとんどモック既定だが、tryEnrichWithKeepa が後段で
 * 価格・BSR・出品者・レビュー数等を実データで上書きする。
 */
function createSeedMetricsFromSearch(hit: KeepaSearchHit, category: string): AsinMetrics {
  return createMockMetrics({
    asin: hit.asin,
    title: hit.title ?? hit.asin,
    brand: hit.brand,
    category,
    overrides: { imageUrl: hit.imageUrl },
  });
}

export async function discoverProducts(
  input: DiscoveryRequest,
  ctx: DiscoverContext = {},
): Promise<DiscoveryResponse> {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(input.limit ?? 20, 5), 100);
  const applyDictionary = input.applyDictionary ?? true;
  const { keywords } = generateKeywords(input.category);
  const dictionary = applyDictionary ? (ctx.dictionary ?? []) : [];

  let useLive = !mockMode.keepa;
  let collected: AsinMetrics[] = [];

  if (useLive) {
    // Keepa Search で 5 軸キーワード上位 4 つから ASIN を集める。
    // 1 検索 = 5 トークン、1 ページ最大 40 件。 perKeyword=8 なら 4 検索 = 20 トークン。
    const searchKeywords = keywords.slice(0, 4);
    const perKeyword = 8;
    const seenAsins = new Set<string>();
    const seeds: AsinMetrics[] = [];
    const searchErrors: string[] = [];

    for (const kw of searchKeywords) {
      try {
        const hits = await searchKeepa(kw, perKeyword);
        for (const hit of hits) {
          if (seenAsins.has(hit.asin)) continue;
          seenAsins.add(hit.asin);
          seeds.push(createSeedMetricsFromSearch(hit, input.category));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[apde:keepa] search failed", { keyword: kw, message });
        searchErrors.push(message);
      }
    }

    if (seeds.length === 0) {
      // 全 search 失敗 → mock にフォールバック
      console.warn("[apde:keepa] all searches failed, falling back to mock", { errors: searchErrors });
      useLive = false;
    } else {
      collected = seeds;
    }
  }

  if (!useLive) {
    // mockMode.keepa = true、または search 全失敗時のフォールバック
    collected = keywords.flatMap((keyword, keywordIndex) =>
      Array.from({ length: 3 }, (_, productIndex) =>
        createMockMetrics({
          category: input.category,
          keyword,
          index: keywordIndex * 3 + productIndex,
        }),
      ),
    );
  }

  // 各候補を Keepa Product で実データ補完 (キャッシュあり)。
  // 並列度は 6 程度に抑えてレート制限を避ける。
  const enrichedAll: Array<{ metrics: AsinMetrics; live: boolean }> = [];
  const CHUNK = 6;
  for (let i = 0; i < collected.length; i += CHUNK) {
    const chunk = collected.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map((seed) =>
        useLive ? tryEnrichWithKeepa(seed) : Promise.resolve({ metrics: seed, live: false }),
      ),
    );
    enrichedAll.push(...results);
  }

  // フィルタ + 除外
  const excluded: ExcludedCandidate[] = [];
  const survivors: AsinMetrics[] = [];
  for (const { metrics } of enrichedAll) {
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

  // 候補を products table に保証 upsert (詳細ページが空欄にならないように)。
  // ここで title / brand / category / image_url を保存しておけば、後で
  // /products/[asin] が getProductSummary で実データを引ける。
  await Promise.all(
    survivors.map((metrics) =>
      upsertProductMaster({
        asin: metrics.asin,
        title: metrics.title,
        brand: metrics.brand,
        category: metrics.category,
        image_url: metrics.imageUrl ?? null,
        current_price: metrics.currentPrice,
        review_count: metrics.reviewCount,
        seller_count: metrics.sellerCount,
        rating: metrics.rating ?? null,
      }).catch((err) => {
        console.warn("[apde] upsertProductMaster failed in discover", {
          asin: metrics.asin,
          err: err instanceof Error ? err.message : String(err),
        });
      }),
    ),
  );

  // 候補を analyzeMetrics で評価 (LLM は呼ばずキーワード生成だけのために createFallbackInsight 使用)。
  // Discovery 時に 20 件分の LLM を回すのはコストが大きいので、当面 mock insight で済ませ、
  // 詳細ページで初めて Gemini を呼ぶ運用とする。
  const analyzed = await Promise.all(
    survivors.map((metrics) => analyzeMetrics({ metrics, source: "hybrid" })),
  );

  // 各候補の source は keepa の live 状況に応じて再設定 (LLM はここでは未使用扱い)
  const liveByAsin = new Map(enrichedAll.map(({ metrics, live }) => [metrics.asin, live]));
  const finalAnalyzed = analyzed.map((r) => ({
    ...r,
    source: determineSource(liveByAsin.get(r.asin) ?? false, false),
  }));
  finalAnalyzed.sort(
    (a, b) => b.score - a.score || b.monthlyRevenueEstimate - a.monthlyRevenueEstimate,
  );
  const top = finalAnalyzed.slice(0, limit);

  // 全体 source: Discovery は LLM を呼ばない設計なので、
  // Keepa が 1 件でも live なら "hybrid"、全 mock なら "mock"。
  const anyLive = enrichedAll.some((e) => e.live);
  const overallSource: DataSource = anyLive ? "hybrid" : "mock";

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
    source: overallSource,
    durationMs: Date.now() - startedAt,
    generatedAt: new Date().toISOString(),
  };
}

export async function analyzeProduct(input: AnalyzeRequest): Promise<AnalysisResult> {
  const baseMetrics = createMockMetrics({
    asin: input.asin,
    title: input.title,
    category: input.category ?? "未分類",
    brand: input.brand,
    overrides: input.metrics,
  });
  const { metrics, live: keepaLive } = await tryEnrichWithKeepa(baseMetrics);
  // 一旦 source を hybrid で組み立て、insight.source の実態に応じて最終決定する。
  const result = await analyzeMetrics({
    metrics,
    source: "hybrid",
    profitOverrides: input.profitOverrides,
  });
  const llmLive = result.insight.source !== "mock";
  return { ...result, source: determineSource(keepaLive, llmLive) };
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
