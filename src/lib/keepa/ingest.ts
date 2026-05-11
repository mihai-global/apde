// Ingest 層: Keepa API → 新スキーマ (products / keepa_snapshot / market_analysis / *_history) への
// 永続化を担う。 /api/ingest/* と Cron がこの関数群を呼ぶ唯一のエントリポイント。
//
// 設計:
// - ingestDiscover: /query で 1 コール 100 件取得。 history なし、 snapshot のみ書き込み。
// - ingestFull:     /product?history=1 で 1 ASIN 全 history を取り、 *_history テーブルに展開。
// - ingestDiff:     /product?history=0 で 1 ASIN snapshot のみ更新。
// - recomputeMarketAnalysis: Keepa を呼ばず、 DB の snapshot から market_analysis を再計算。
//
// すべての関数は冪等。 ingest 系は products に必ず upsert してから history 系を insert する
// (FK 制約の都合)。

import { evaluateGates } from "@/lib/gates";
import {
  fetchKeepaProductsBatch,
  fetchKeepaSeries,
  fetchKeepaTokenStatus,
  findProductsByCategory,
  type KeepaProduct,
  type KeepaSeries,
} from "@/lib/keepa/client";
import { findCategory, DEFAULT_CATEGORY } from "@/lib/keepa/categories";
import { keepaProductToMetrics, deriveKeepaMetrics } from "@/lib/keepa/derive";
import { computeProfit } from "@/lib/profit";
import { scoreAsin } from "@/lib/scoring";
import { computeMarketScore, deriveAxesFromBreakdown } from "@/lib/scoring/market";
import {
  insertBsrHistory,
  insertPriceHistory,
  insertSellerHistory,
  listProductSummaries,
  syncTierFromWatchlist,
  updateProductRefreshMeta,
  upsertKeepaSnapshot,
  upsertMarketAnalysis,
  upsertProductMaster,
  getKeepaSnapshot,
} from "@/lib/supabase/repositories";
import type {
  AsinMetrics,
  BsrHistoryRow,
  KeepaSnapshotRow,
  MarketAnalysisRow,
  MonthlySalesSource,
  PriceHistoryRow,
  SellerHistoryRow,
} from "@/lib/types";

function nowIso(): string {
  return new Date().toISOString();
}

function snapshotFromKeepaProduct(p: KeepaProduct): KeepaSnapshotRow {
  return {
    asin: p.asin,
    current_amazon_yen: typeof p.currentPrice === "number" ? Math.round(p.currentPrice) : null,
    current_new_yen: typeof p.currentPrice === "number" ? Math.round(p.currentPrice) : null,
    buy_box_yen: null,
    bsr: typeof p.currentBsr === "number" ? Math.round(p.currentBsr) : null,
    count_new: typeof p.currentSellerCount === "number" ? Math.round(p.currentSellerCount) : null,
    count_reviews:
      typeof p.currentReviewCount === "number" ? Math.round(p.currentReviewCount) : null,
    rating_avg: typeof p.currentRating === "number" ? p.currentRating : null,
    monthly_sold: typeof p.monthlySold === "number" && p.monthlySold > 0 ? p.monthlySold : null,
    package_weight_g: typeof p.weightGrams === "number" ? p.weightGrams : null,
    category_tree: p.category ? [{ name: p.category }] : null,
    fetched_at: nowIso(),
  };
}

function snapshotFromKeepaSeries(asin: string, s: KeepaSeries): KeepaSnapshotRow {
  return {
    asin,
    current_amazon_yen:
      typeof s.currentPrice === "number" ? Math.round(s.currentPrice) : null,
    current_new_yen: typeof s.currentPrice === "number" ? Math.round(s.currentPrice) : null,
    buy_box_yen: s.buyBox.length > 0 ? Math.round(s.buyBox.at(-1)!.value) : null,
    bsr: s.bsr.length > 0 ? Math.round(s.bsr.at(-1)!.value) : null,
    count_new:
      typeof s.currentSellerCount === "number"
        ? Math.round(s.currentSellerCount)
        : s.sellers.length > 0
          ? Math.round(s.sellers.at(-1)!.value)
          : null,
    count_reviews:
      typeof s.currentReviewCount === "number"
        ? Math.round(s.currentReviewCount)
        : s.reviewCount.length > 0
          ? Math.round(s.reviewCount.at(-1)!.value)
          : null,
    rating_avg: typeof s.currentRating === "number" ? s.currentRating : null,
    monthly_sold: typeof s.monthlySold === "number" && s.monthlySold > 0 ? s.monthlySold : null,
    package_weight_g: typeof s.weightGrams === "number" ? s.weightGrams : null,
    category_tree: s.category ? [{ name: s.category }] : null,
    fetched_at: nowIso(),
  };
}

/**
 * snapshot + AsinMetrics から market_analysis を計算して upsert。
 * AsinMetrics は keepaProductToMetrics で組み立てた骨格を渡す前提。
 */
async function computeAndPersistMarket(
  asin: string,
  metrics: AsinMetrics,
  monthlySalesSource: MonthlySalesSource,
): Promise<void> {
  const structural = scoreAsin(metrics);
  const profit = computeProfit(metrics);
  const derived = deriveKeepaMetrics(metrics);
  const gates = evaluateGates({ metrics, derived, profit });
  const axes = deriveAxesFromBreakdown(structural.breakdown, {
    estimatedMonthlySales: metrics.estimatedMonthlySales,
    grossMarginRate: metrics.grossMarginRate,
  });
  const ms = computeMarketScore({ axes, gates });

  const row: MarketAnalysisRow = {
    asin,
    axis_demand: axes.demand,
    axis_competition: axes.competition,
    axis_profit: axes.profit,
    axis_stability: axes.stability,
    axis_differentiation: axes.differentiation,
    gates_passed: ms.gatesPassed,
    gates_failed: ms.gatesFailed,
    market_score: ms.score,
    decision: ms.decision,
    monthly_sales_source: monthlySalesSource,
    computed_at: nowIso(),
  };
  await upsertMarketAnalysis(row);
}

// ─── ingestDiscover (新カテゴリ調査) ───────────────────────────────────

export interface IngestDiscoverInput {
  category?: string;       // category id or label。空ならカテゴリ全体を呼ばない
  keyword?: string;        // 任意キーワード (Keepa /query の title)
  minPrice?: number;       // JPY
  maxPrice?: number;
  minReviews?: number;
  maxReviews?: number;
  perPage?: number;        // default 50, max 200 (内部で 2 ページ取得)
  /** 旧仕様の bulk /product enrichment を有効にする。 1 ASIN ≈ 1 token 課金されるため
   * デフォルト false。 title 未取得などで明示的に有効化する場合のみ true に。 */
  enrich?: boolean;
}

export interface IngestDiscoverResult {
  ingested: number;        // products + snapshot + market_analysis に書いた件数
  asins: string[];
  durationMs: number;
  /** Keepa token がマイナスで実行を拒否した場合の理由 */
  refusedReason?: string;
  tokensLeft?: number;
  /** /query が返したが title / price が空で除外した件数 (ノイズ抑制目的) */
  skippedEmpty?: number;
}

/** Keepa が過剰請求しないように、 ingest 系開始時にこの値より tokensLeft が
 * 少ない場合は実行を拒否する。 -10 まで許容するのは /token 取得自体の誤差吸収。 */
const TOKEN_REFUSAL_THRESHOLD = -10;

/** 共通 precheck。 0 token 課金の /token を呼び、残量がしきい値を下回っていれば
 * 拒否情報を返す (上位は throw でなく Result を見て中断する想定)。 */
async function precheckTokenBalance(): Promise<
  { ok: true; tokensLeft: number } | { ok: false; tokensLeft: number; refusedReason: string }
> {
  try {
    const status = await fetchKeepaTokenStatus();
    if (status.tokensLeft < TOKEN_REFUSAL_THRESHOLD) {
      const refillMin = Math.ceil(
        (TOKEN_REFUSAL_THRESHOLD - status.tokensLeft) / Math.max(status.refillRate, 1),
      );
      return {
        ok: false,
        tokensLeft: status.tokensLeft,
        refusedReason: `Keepa tokensLeft=${status.tokensLeft} (要求: ≥ ${TOKEN_REFUSAL_THRESHOLD})。 復帰まで約 ${refillMin} 分。`,
      };
    }
    return { ok: true, tokensLeft: status.tokensLeft };
  } catch {
    return { ok: true, tokensLeft: -1 }; // /token 失敗時は best-effort で続行
  }
}

/**
 * Keepa /query 1 コールで取得 → products / keepa_snapshot / market_analysis に永続化。
 * tier は watchlist.status から派生 (未登録なら 3)。
 * 詳細ページが触られた時点で初めて ingestFull が走る運用 (このフェーズでは history は取らない)。
 */
export async function ingestDiscover(
  input: IngestDiscoverInput,
): Promise<IngestDiscoverResult> {
  const start = Date.now();
  const limit = Math.min(Math.max(input.perPage ?? 50, 5), 200);
  const appCategory = input.category
    ? findCategory(input.category) ?? DEFAULT_CATEGORY
    : DEFAULT_CATEGORY;
  const keyword = input.keyword?.trim() || undefined;

  // 開始前に Keepa /token で残量を確認 (これ自体は 0 token 課金)。
  // 残量が深く負なら、 ingest 中にさらに使い込むのを防ぐためここで断る。
  const balance = await precheckTokenBalance();
  if (!balance.ok) {
    return {
      ingested: 0,
      asins: [],
      durationMs: Date.now() - start,
      tokensLeft: balance.tokensLeft,
      refusedReason: balance.refusedReason,
    };
  }
  const tokensLeft = balance.tokensLeft;

  const products = await findProductsByCategory({
    rootCategory: appCategory.keepaRootCategory,
    title: keyword,
    minPriceJpy: input.minPrice,
    maxPriceJpy: input.maxPrice,
    minReviews: input.minReviews,
    maxReviews: input.maxReviews,
    limit,
  });

  if (products.length === 0) {
    return { ingested: 0, asins: [], durationMs: Date.now() - start, tokensLeft };
  }

  // /query が ASIN だけ返した場合の bulk /product (history=0) enrichment。
  // 1 ASIN ≈ 1 token 課金されるので、 input.enrich === true のときだけ実行する。
  // 通常は title だけでも DB 表示には十分なため、 default skip。
  let enriched: Map<string, KeepaProduct> = new Map();
  if (input.enrich) {
    const needsEnrich = products.filter((p) => !p.title).map((p) => p.asin);
    if (needsEnrich.length > 0) {
      try {
        const got = await fetchKeepaProductsBatch(needsEnrich);
        enriched = new Map(got.map((p) => [p.asin, p]));
      } catch (err) {
        console.warn("[apde:ingest:discover] enrich batch failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  const merged: KeepaProduct[] = products.map((p) => {
    const more = enriched.get(p.asin);
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

  const ts = nowIso();
  // Keepa から meta data (title / price) が取れていない ASIN は market_analysis 上で
  // 意味のあるスコアにならない (mock seed のままで decision が当てにならない) ため除外。
  // title または currentPrice のどちらかでも取れていれば残す。
  const totalReturned = merged.length;
  const validProducts = merged.filter(
    (p) =>
      typeof p.asin === "string" &&
      p.asin.length > 0 &&
      ((typeof p.title === "string" && p.title.trim().length > 0) ||
        (typeof p.currentPrice === "number" && p.currentPrice > 0)),
  );
  const skippedEmpty = totalReturned - validProducts.length;
  const asins = validProducts.map((p) => p.asin);

  // バッチ並列化: 1 ASIN 内は (FK 制約のため) products → snapshot → market を直列。
  // ASIN 同士は Promise.all で並列。 BATCH 件ずつ処理し、
  // Supabase の同時接続枯渇を避ける。
  const BATCH = 10;
  for (let i = 0; i < validProducts.length; i += BATCH) {
    const slice = validProducts.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (p) => {
        try {
          await upsertProductMaster({
            asin: p.asin,
            title: p.title,
            brand: p.brand,
            category: p.category ?? appCategory.label,
            image_url: p.imageUrl ?? null,
            current_price: p.currentPrice,
            review_count: p.currentReviewCount,
            seller_count: p.currentSellerCount,
            rating: p.currentRating ?? null,
            weight_grams: p.weightGrams,
          });

          await upsertKeepaSnapshot(snapshotFromKeepaProduct(p));
          await updateProductRefreshMeta({ asin: p.asin, diffAt: ts });
          await syncTierFromWatchlist(p.asin);

          const metrics = keepaProductToMetrics(p, appCategory.label);
          const source: MonthlySalesSource = metrics.monthlySalesSource ?? "seed";
          await computeAndPersistMarket(p.asin, metrics, source);
        } catch (err) {
          console.warn("[apde:ingest:discover] per-asin failed", {
            asin: p.asin,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  return {
    ingested: asins.length,
    asins,
    durationMs: Date.now() - start,
    tokensLeft,
    skippedEmpty,
  };
}

// ─── ingestFull (1 ASIN, history=1) ────────────────────────────────────

export interface IngestFullResult {
  asin: string;
  pricePoints: number;
  bsrPoints: number;
  sellerPoints: number;
  refusedReason?: string;
  tokensLeft?: number;
}

/**
 * 1 ASIN を /product?history=1 で取り、 history を 4 つの履歴テーブルに展開する。
 * 詳細ページ初訪 or keepa_last_full_at が 90 日以上経過したときに呼ぶ。
 * 1 token / ASIN 消費 (history=1 含む)。
 */
export async function ingestFull(asin: string): Promise<IngestFullResult> {
  const balance = await precheckTokenBalance();
  if (!balance.ok) {
    return {
      asin,
      pricePoints: 0,
      bsrPoints: 0,
      sellerPoints: 0,
      tokensLeft: balance.tokensLeft,
      refusedReason: balance.refusedReason,
    };
  }
  const series = await fetchKeepaSeries(asin);

  // products を保証 upsert (FK 制約)
  await upsertProductMaster({
    asin,
    title: series.title,
    brand: series.brand,
    category: series.category,
    image_url: series.imageUrl ?? null,
    current_price: series.currentPrice,
    review_count: series.currentReviewCount,
    seller_count: series.currentSellerCount,
    rating: series.currentRating ?? null,
    weight_grams: series.weightGrams,
  });

  const ts = nowIso();
  await upsertKeepaSnapshot(snapshotFromKeepaSeries(asin, series));
  await updateProductRefreshMeta({ asin, diffAt: ts, fullAt: ts });
  await syncTierFromWatchlist(asin);

  // 履歴を normalize して insert
  const priceRows: PriceHistoryRow[] = series.price.map((p) => ({
    asin,
    price_type: "new",
    ts: p.timestamp,
    price_yen: p.value > 0 ? Math.round(p.value) : null,
  }));
  const buyBoxRows: PriceHistoryRow[] = series.buyBox.map((p) => ({
    asin,
    price_type: "buybox",
    ts: p.timestamp,
    price_yen: p.value > 0 ? Math.round(p.value) : null,
  }));
  const bsrRows: BsrHistoryRow[] = series.bsr.map((p) => ({
    asin,
    ts: p.timestamp,
    rank: p.value > 0 ? Math.round(p.value) : null,
  }));
  const sellerRows: SellerHistoryRow[] = series.sellers.map((p) => ({
    asin,
    ts: p.timestamp,
    count_new: p.value >= 0 ? Math.round(p.value) : null,
  }));

  await Promise.all([
    insertPriceHistory([...priceRows, ...buyBoxRows]),
    insertBsrHistory(bsrRows),
    insertSellerHistory(sellerRows),
  ]);

  // market_analysis 再計算 (history を活かして CV / drop rate を反映)
  // AsinMetrics は KeepaSeries から組み立てる必要があるので、簡易マッピングで対応。
  // ここでは createMockMetrics ベースに上書きし、 keepaProductToMetrics と整合させる。
  const fakeProduct: KeepaProduct = {
    asin,
    title: series.title,
    brand: series.brand,
    category: series.category,
    weightGrams: series.weightGrams,
    monthlySold: series.monthlySold,
    currentPrice: series.currentPrice,
    currentSellerCount: series.currentSellerCount,
    currentReviewCount: series.currentReviewCount,
    currentRating: series.currentRating,
    imageUrl: series.imageUrl,
  };
  const baseMetrics = keepaProductToMetrics(fakeProduct, series.category ?? "未分類");
  baseMetrics.priceHistory = series.price;
  baseMetrics.bsrHistory = series.bsr;
  baseMetrics.sellerCountHistory = series.sellers;
  baseMetrics.buyBoxHistory = series.buyBox;
  await computeAndPersistMarket(
    asin,
    baseMetrics,
    baseMetrics.monthlySalesSource ?? "seed",
  );

  return {
    asin,
    pricePoints: priceRows.length + buyBoxRows.length,
    bsrPoints: bsrRows.length,
    sellerPoints: sellerRows.length,
    tokensLeft: balance.tokensLeft,
  };
}

// ─── ingestDiff (1 ASIN, history=0) ────────────────────────────────────

export interface IngestDiffResult {
  asin: string;
  updated: boolean;
  refusedReason?: string;
  tokensLeft?: number;
}

/**
 * 1 ASIN を /product?history=0 で取り、 keepa_snapshot のみ更新する。
 * Cron (Tier 1: 24h, Tier 2: 7d) と詳細ページの「最新値を取得」ボタンから呼ばれる。
 * 1 token / ASIN 消費。
 */
export async function ingestDiff(asin: string): Promise<IngestDiffResult> {
  const balance = await precheckTokenBalance();
  if (!balance.ok) {
    return {
      asin,
      updated: false,
      tokensLeft: balance.tokensLeft,
      refusedReason: balance.refusedReason,
    };
  }
  const got = await fetchKeepaProductsBatch([asin]);
  const p = got[0];
  if (!p) return { asin, updated: false };

  await upsertProductMaster({
    asin: p.asin,
    title: p.title,
    brand: p.brand,
    category: p.category,
    image_url: p.imageUrl ?? null,
    current_price: p.currentPrice,
    review_count: p.currentReviewCount,
    seller_count: p.currentSellerCount,
    rating: p.currentRating ?? null,
    weight_grams: p.weightGrams,
  });

  const ts = nowIso();
  await upsertKeepaSnapshot(snapshotFromKeepaProduct(p));
  await updateProductRefreshMeta({ asin: p.asin, diffAt: ts });
  await syncTierFromWatchlist(p.asin);

  // market_analysis 再計算
  const metrics = keepaProductToMetrics(p, p.category ?? "未分類");
  await computeAndPersistMarket(
    p.asin,
    metrics,
    metrics.monthlySalesSource ?? "seed",
  );

  return { asin: p.asin, updated: true, tokensLeft: balance.tokensLeft };
}

// ─── recomputeMarketAnalysis (DB-only) ─────────────────────────────────

/**
 * Keepa を呼ばず、 DB の keepa_snapshot + products から AsinMetrics を組み立て、
 * market_analysis を再計算する。 weight 等の評価式を変えたあとに一括再計算するための関数。
 *
 * 重要: snapshot 単体だと brand / title が無く applyBrandPolicy が効かない。
 * products テーブルから brand / title / category / image_url を補完する。
 */
export async function recomputeMarketAnalysis(
  asin: string,
): Promise<{ asin: string; recomputed: boolean }> {
  const [snap, productList] = await Promise.all([
    getKeepaSnapshot(asin),
    listProductSummaries([asin]),
  ]);
  if (!snap) return { asin, recomputed: false };
  const product = productList[0];

  // KeepaSnapshot + products → KeepaProduct 互換オブジェクト → AsinMetrics
  const fakeProduct: KeepaProduct = {
    asin,
    title: product?.title,
    brand: product?.brand,
    imageUrl: product?.imageUrl,
    category: product?.category ?? snap.category_tree?.[0]?.name,
    weightGrams: snap.package_weight_g ?? undefined,
    monthlySold: snap.monthly_sold ?? undefined,
    currentPrice: snap.current_new_yen ?? snap.current_amazon_yen ?? undefined,
    currentSellerCount: snap.count_new ?? undefined,
    currentReviewCount: snap.count_reviews ?? undefined,
    currentRating: snap.rating_avg ?? undefined,
    currentBsr: snap.bsr ?? undefined,
  };
  const categoryName = product?.category ?? snap.category_tree?.[0]?.name ?? "未分類";
  const metrics = keepaProductToMetrics(fakeProduct, categoryName);
  await computeAndPersistMarket(asin, metrics, metrics.monthlySalesSource ?? "seed");
  return { asin, recomputed: true };
}
