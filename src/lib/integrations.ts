// 探索 / 分析 / 再評価のオーケストレーション。
// 各ステップは小さなモジュールに分離し、ここでは流れだけを記述する。
import { mockMode } from "@/lib/env";
import { evaluateGates, decisionFromScore, downgradeByGates } from "@/lib/gates";
import {
  fetchKeepaProductsBatch,
  fetchKeepaSeries,
  findProductsByCategory,
  type KeepaProduct,
  type KeepaSeries,
} from "@/lib/keepa/client";
import { findCategory, DEFAULT_CATEGORY } from "@/lib/keepa/categories";
import { deriveKeepaMetrics, keepaProductToMetrics } from "@/lib/keepa/derive";
import { createMockMetrics } from "@/lib/keepa/mock";
import { evaluateExclusion, toExcludedCandidate } from "@/lib/exclusion/filter";
import { generateInsight } from "@/lib/llm";
import { createFallbackInsight } from "@/lib/llm/mock";
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

function pickConcern(
  metrics: AsinMetrics,
  reasons: string[],
  risks: string[],
  gates?: AnalysisResult["gates"],
): string {
  // 強制ゲート発動が最優先 (高スコアでも NO-GO の理由はここから来る)
  if (gates) {
    const failedNoGo = gates.find((g) => !g.pass && g.severity === "NO_GO");
    if (failedNoGo) return `${failedNoGo.name}: ${failedNoGo.observed} (基準 ${failedNoGo.threshold})`;
    const failedConditional = gates.find((g) => !g.pass && g.severity === "CONDITIONAL_CAP");
    if (failedConditional)
      return `${failedConditional.name}: ${failedConditional.observed} (基準 ${failedConditional.threshold})`;
  }
  if (risks.length > 0) return risks[0]!.replace(/^[^:]+:\s*/, "");
  if (reasons.length > 0) return reasons[0]!;
  return `重量 ${metrics.weightGrams}g / レビュー ${metrics.reviewCount} 件で要追跡`;
}

interface AnalyzeOptions {
  metrics: AsinMetrics;
  source: DataSource;
  profitOverrides?: { costRate?: number; cvr?: number; cpc?: number };
  /** true なら LLM 呼び出しをスキップしフォールバック洞察を返す (Discovery 一括用) */
  skipLlm?: boolean;
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
      // FK 制約があるため、まず products に最低限の行を upsert。
      // current* スナップショットを優先し、無ければ履歴の末尾値を使う。
      const sellerCount =
        series.currentSellerCount ?? series.sellers.at(-1)?.value;
      const reviewCount =
        series.currentReviewCount ?? series.reviewCount.at(-1)?.value;
      const rating =
        series.currentRating ?? (series.rating.at(-1)?.value ? series.rating.at(-1)!.value / 10 : undefined);
      const currentPrice = series.currentPrice ?? series.price.at(-1)?.value;
      await upsertProductMaster({
        asin: metrics.asin,
        title: titleFromKeepa,
        brand: brandFromKeepa,
        category: categoryFromKeepa,
        image_url: imageUrlFromKeepa ?? null,
        current_price: currentPrice,
        seller_count: typeof sellerCount === "number" ? Math.max(1, Math.round(sellerCount)) : undefined,
        review_count: typeof reviewCount === "number" ? Math.max(0, Math.round(reviewCount)) : undefined,
        rating: typeof rating === "number" ? rating : undefined,
        weight_grams: series.weightGrams,
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

  // 直近値で metrics を上書き (履歴ではなく現時点のスナップショット)
  if (series.currentPrice !== undefined) enriched.currentPrice = Math.round(series.currentPrice);
  if (series.currentSellerCount !== undefined) {
    enriched.sellerCount = Math.max(1, Math.round(series.currentSellerCount));
  }
  if (series.currentReviewCount !== undefined) {
    enriched.reviewCount = Math.max(0, Math.round(series.currentReviewCount));
  } else if (series.reviewCount.length > 0) {
    enriched.reviewCount = Math.max(0, Math.round(series.reviewCount.at(-1)!.value));
  }
  if (series.currentRating !== undefined) enriched.rating = series.currentRating;
  if (series.weightGrams !== undefined && series.weightGrams > 0) {
    enriched.weightGrams = series.weightGrams;
    // 重量に応じて sizeTier も更新 (>1kg は OVERSIZE 扱い)
    enriched.sizeTier = series.weightGrams > 1000 ? "OVERSIZE" : enriched.weightGrams <= 500 ? "SMALL_STANDARD" : "LARGE_STANDARD";
  }
  if (series.monthlySold !== undefined && series.monthlySold > 0) {
    enriched.estimatedMonthlySales = series.monthlySold;
    enriched.monthlySalesSource = "keepa";
  } else if (series.bsr.length > 0) {
    // Keepa が monthlySold を提供しない場合は BSR ベースの粗い推定にフォールバック。
    const latestBsr = series.bsr.at(-1)!.value;
    let estimated = 10;
    if (latestBsr < 100) estimated = 1500;
    else if (latestBsr < 1000) estimated = 500;
    else if (latestBsr < 5000) estimated = 200;
    else if (latestBsr < 20000) estimated = 80;
    else if (latestBsr < 100000) estimated = 30;
    enriched.estimatedMonthlySales = estimated;
    enriched.monthlySalesSource = "bsr";
  } else {
    // Keepa からも BSR 履歴も取れない場合 (新商品 / Keepa 失敗) は seed 乱数のまま
    enriched.monthlySalesSource = "seed";
  }

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

  const insight = opts.skipLlm
    ? createFallbackInsight({
        decision,
        category: opts.metrics.category,
        brand: opts.metrics.brand,
        competitionLevel: structural.competitionLevel,
        summary,
        reviewCount: opts.metrics.reviewCount,
      })
    : await generateInsight({
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
    monthlySalesSource: result.metrics.monthlySalesSource,
    competitionLevel: result.competitionLevel,
    summary: result.summary,
    reasons: result.reasons,
    weightGrams: result.metrics.weightGrams,
    sizeTier: result.metrics.sizeTier,
    grossMarginRate: result.metrics.grossMarginRate,
    brandStrength: result.metrics.brandStrength,
    rating: result.metrics.rating,
    imageUrl: result.metrics.imageUrl,
    concern: pickConcern(result.metrics, result.reasons, result.risks, result.gates),
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
  const limit = Math.min(Math.max(input.limit ?? 100, 5), 200);
  const applyDictionary = input.applyDictionary ?? true;
  const dictionary = applyDictionary ? (ctx.dictionary ?? []) : [];
  const keyword = input.keyword?.trim();

  // 入力カテゴリ (UI 表示名 or slug) を Keepa rootCategory ID に解決
  const appCategory = findCategory(input.category) ?? DEFAULT_CATEGORY;

  let useLive = !mockMode.keepa;
  let collected: AsinMetrics[] = [];
  let liveAsinSet = new Set<string>();

  if (useLive) {
    try {
      const products = await findProductsByCategory({
        rootCategory: appCategory.keepaRootCategory,
        title: keyword || undefined,
        minPriceJpy: input.minPrice,
        maxPriceJpy: input.maxPrice,
        minReviews: input.minReviews,
        maxReviews: input.maxReviews,
        limit, // 1 ページ 100、 max 200 は内部で 2 ページ取得
      });
      console.info("[apde:discover] /query result", {
        category: appCategory.label,
        keyword: keyword || null,
        productsCount: products.length,
        productsWithTitle: products.filter((p) => !!p.title).length,
      });
      if (products.length > 0) {
        // /query は ASIN リストのみ返すパターンが多く、 title/brand/image が空のことが多い。
        // 空の ASIN を /product (history=0, バルク) で enrich して候補リストに使う。
        const needsEnrichment = products.filter((p) => !p.title || !p.imageUrl).map((p) => p.asin);
        let enrichedMap: Map<string, KeepaProduct> = new Map();
        if (needsEnrichment.length > 0) {
          try {
            const enriched = await fetchKeepaProductsBatch(needsEnrichment);
            enrichedMap = new Map(enriched.map((p) => [p.asin, p]));
          } catch (err) {
            console.warn("[apde:discover] bulk product enrich failed", {
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
        const merged: KeepaProduct[] = products.map((p) => {
          const more = enrichedMap.get(p.asin);
          if (!more) return p;
          return {
            ...p,
            title: p.title ?? more.title,
            brand: p.brand ?? more.brand,
            imageUrl: p.imageUrl ?? more.imageUrl,
            category: p.category ?? more.category,
            weightGrams: p.weightGrams ?? more.weightGrams,
            currentPrice: p.currentPrice ?? more.currentPrice,
            currentSellerCount: p.currentSellerCount ?? more.currentSellerCount,
            currentReviewCount: p.currentReviewCount ?? more.currentReviewCount,
            currentRating: p.currentRating ?? more.currentRating,
            currentBsr: p.currentBsr ?? more.currentBsr,
            monthlySold: p.monthlySold ?? more.monthlySold,
            isHazmat: p.isHazmat ?? more.isHazmat,
          };
        });
        collected = merged.map((p) => keepaProductToMetrics(p, appCategory.label));
        liveAsinSet = new Set(collected.map((m) => m.asin));
      } else {
        console.warn("[apde:discover] /query returned 0 products, falling back to mock");
        useLive = false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[apde:discover] /query failed, falling back to mock", { message });
      useLive = false;
    }
  }

  if (!useLive) {
    // mockMode.keepa = true、または /query 失敗時のフォールバック
    collected = Array.from({ length: Math.min(limit, 24) }, (_, i) =>
      createMockMetrics({
        category: appCategory.label,
        keyword: keyword ?? "",
        index: i,
      }),
    );
  }

  // /query が rich product を返してくれるので、 per-ASIN /product enrich はスキップ。
  // 詳細ページで初めて fetchKeepaSeries が走る運用。
  const enrichedAll = collected.map((metrics) => ({
    metrics,
    live: liveAsinSet.has(metrics.asin),
  }));

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
        weight_grams: metrics.weightGrams,
      }).catch((err) => {
        console.warn("[apde] upsertProductMaster failed in discover", {
          asin: metrics.asin,
          err: err instanceof Error ? err.message : String(err),
        });
      }),
    ),
  );

  // 候補を analyzeMetrics で評価。 Discovery 時は LLM をスキップし、Gemini トークンと
  // レスポンス時間を節約。詳細ページで初めて Gemini を呼ぶ運用。
  const analyzed = await Promise.all(
    survivors.map((metrics) => analyzeMetrics({ metrics, source: "hybrid", skipLlm: true })),
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
    category: appCategory.label,
    // 後方互換: keywords は単一キーワード or 空配列
    keywords: keyword ? [keyword] : [],
    filters: {
      keyword: keyword || undefined,
      minPrice: input.minPrice,
      maxPrice: input.maxPrice,
      maxReviews: input.maxReviews,
      minReviews: input.minReviews,
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
