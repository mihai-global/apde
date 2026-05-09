// In-memory store: mockMode.supabase = true のとき、Supabase の代わりにこれを使う。
// 同じプロセス内で永続化されるためローカル開発で UI 動作確認に十分。
import type {
  AnalysisRow,
  AnalysisThreadRow,
  ApiUsageRow,
  AppSettingRow,
  DictionaryRow,
  DiscoveryRunRow,
  PurchaseFeedbackRow,
  WatchlistRow,
} from "@/lib/types";

export interface MockProductRow {
  asin: string;
  title: string;
  category: string;
  brand: string;
  current_price: number;
  weight_grams: number;
  size_tier: "SMALL_STANDARD" | "LARGE_STANDARD" | "OVERSIZE";
  review_count: number;
  seller_count: number;
  brand_strength: number;
  rating: number;
  is_hazmat: boolean;
  is_regulated: boolean;
  monthly_sales: number;
  gross_margin_pct: number;
  decision: "GO" | "CONDITIONAL_GO" | "NO_GO";
  score: number;
  breakdown: { price: number; size: number; comp: number; stab: number; oem: number };
  concern: string;
  seed_keepa: number;
  /** Keepa imagesCSV 由来の商品画像 URL（モックは未設定でプレースホルダー表示） */
  image_url?: string | null;
}

export interface MockStoreState {
  products: Map<string, MockProductRow>;
  watchlist: Map<string, WatchlistRow>;
  dictionary: DictionaryRow[];
  discoveryRuns: DiscoveryRunRow[];
  analysis: AnalysisRow[];
  apiUsage: ApiUsageRow[];
  appSettings: Map<string, AppSettingRow>;
  threads: AnalysisThreadRow[];
  feedback: Map<string, PurchaseFeedbackRow>;
}

declare global {
  // eslint-disable-next-line no-var
  var __apdeMockStore: MockStoreState | undefined;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seedProducts(): Map<string, MockProductRow> {
  const products: MockProductRow[] = [
    { asin: "B0CXM7K2PQ", category: "デスク周り", title: "本革デスクマット ブラウン 90×45cm 撥水 ステッチエッジ", brand: "MUUTO Crafts", current_price: 5980, weight_grams: 720, size_tier: "LARGE_STANDARD", review_count: 287, rating: 4.4, seller_count: 8, brand_strength: 32, monthly_sales: 384, gross_margin_pct: 38, decision: "GO", score: 81, breakdown: { price: 25, size: 12, comp: 20, stab: 15, oem: 9 }, concern: "工場再現性は中。素材グレード差別化で勝負", seed_keepa: 17, is_hazmat: false, is_regulated: false },
    { asin: "B09JFR2T8L", category: "デスク周り", title: "ケーブルオーガナイザー トレイ マグネット式 シリコン製", brand: "Anker系列", current_price: 2480, weight_grams: 280, size_tier: "SMALL_STANDARD", review_count: 124, rating: 4.2, seller_count: 12, brand_strength: 28, monthly_sales: 612, gross_margin_pct: 41, decision: "GO", score: 78, breakdown: { price: 15, size: 20, comp: 20, stab: 13, oem: 10 }, concern: "価格帯が低めで利益絶対値は薄い", seed_keepa: 7, is_hazmat: false, is_regulated: false },
    { asin: "B0BQHM6X5K", category: "キッチン雑貨", title: "シリコン スプーンレスト & 蓋置き 2点セット 耐熱 食洗機対応", brand: "kitchenia", current_price: 1680, weight_grams: 180, size_tier: "SMALL_STANDARD", review_count: 432, rating: 4.5, seller_count: 18, brand_strength: 18, monthly_sales: 920, gross_margin_pct: 26, decision: "CONDITIONAL_GO", score: 71, breakdown: { price: 0, size: 20, comp: 20, stab: 15, oem: 16 }, concern: "粗利率が30%を下回る。原価交渉余地あり", seed_keepa: 23, is_hazmat: false, is_regulated: false },
    { asin: "B0D2VMC7XR", category: "デスク周り", title: "在宅ワーク向け モニター下 デスクトレイ 木目 引き出し付き", brand: "Sanwa Supply", current_price: 4980, weight_grams: 1240, size_tier: "OVERSIZE", review_count: 96, rating: 4.1, seller_count: 5, brand_strength: 61, monthly_sales: 142, gross_margin_pct: 22, decision: "NO_GO", score: 42, breakdown: { price: 25, size: 0, comp: 10, stab: 5, oem: 2 }, concern: "重量1kg超でFBA手数料が利益を圧迫。大型扱い", seed_keepa: 33, is_hazmat: false, is_regulated: false },
    { asin: "B0CLM4HRNV", category: "美容", title: "美顔ローラー チタン製 リフトケア 防水 24金コーティング", brand: "RefaWave", current_price: 6800, weight_grams: 110, size_tier: "SMALL_STANDARD", review_count: 348, rating: 4.0, seller_count: 22, brand_strength: 24, monthly_sales: 286, gross_margin_pct: 44, decision: "GO", score: 84, breakdown: { price: 25, size: 20, comp: 15, stab: 13, oem: 11 }, concern: "差別化はパッケージとブランド体験で", seed_keepa: 41, is_hazmat: false, is_regulated: false },
    { asin: "B07P2HK3ZD", category: "ペット用品", title: "猫用 自動給餌器 タイマー式 ステンレストレイ 6L", brand: "Petlibro", current_price: 7480, weight_grams: 1860, size_tier: "OVERSIZE", review_count: 1240, rating: 4.3, seller_count: 14, brand_strength: 71, monthly_sales: 410, gross_margin_pct: 18, decision: "NO_GO", score: 31, breakdown: { price: 25, size: 0, comp: 0, stab: 5, oem: 1 }, concern: "強ブランド独占 + 大型 + 認証必須。新規参入は厳しい", seed_keepa: 51, is_hazmat: false, is_regulated: false },
    { asin: "B0BMGQ2NXL", category: "文房具", title: "ノートカバー A5 本革 リフィル交換式 マルチペン挿し", brand: "Itoya inspired", current_price: 4200, weight_grams: 240, size_tier: "SMALL_STANDARD", review_count: 218, rating: 4.6, seller_count: 10, brand_strength: 20, monthly_sales: 196, gross_margin_pct: 35, decision: "GO", score: 76, breakdown: { price: 25, size: 20, comp: 20, stab: 9, oem: 2 }, concern: "OEM適性低。差別化は素材と縫製のみ", seed_keepa: 61, is_hazmat: false, is_regulated: false },
    { asin: "B0DKW6Q83V", category: "キッチン雑貨", title: "ステンレス クッキングトング サラダ 24cm シリコンチップ", brand: "OXO風", current_price: 1280, weight_grams: 145, size_tier: "SMALL_STANDARD", review_count: 612, rating: 4.4, seller_count: 28, brand_strength: 14, monthly_sales: 488, gross_margin_pct: 19, decision: "NO_GO", score: 53, breakdown: { price: 0, size: 20, comp: 10, stab: 11, oem: 12 }, concern: "価格帯が低く粗利率<30%。広告耐性も不足", seed_keepa: 71, is_hazmat: false, is_regulated: false },
    { asin: "B0F1XW82KH", category: "アウトドア", title: "折りたたみチェア 軽量 アルミ アウトドア キャンプ 耐荷重120kg", brand: "Coleman compatible", current_price: 5480, weight_grams: 1320, size_tier: "OVERSIZE", review_count: 540, rating: 4.2, seller_count: 16, brand_strength: 42, monthly_sales: 230, gross_margin_pct: 28, decision: "CONDITIONAL_GO", score: 64, breakdown: { price: 25, size: 0, comp: 10, stab: 13, oem: 16 }, concern: "サイズ区分大型。FBA手数料控除でギリギリ", seed_keepa: 81, is_hazmat: false, is_regulated: false },
    { asin: "B0G7MNCVTQ", category: "収納 / 整理", title: "プラ収納ボックス 10L 透明 スタッキング 蓋付き 3個セット", brand: "Iris風", current_price: 3280, weight_grams: 940, size_tier: "LARGE_STANDARD", review_count: 178, rating: 4.3, seller_count: 9, brand_strength: 36, monthly_sales: 342, gross_margin_pct: 32, decision: "CONDITIONAL_GO", score: 68, breakdown: { price: 25, size: 12, comp: 20, stab: 8, oem: 3 }, concern: "価格安定性に課題。セール頻度が高い", seed_keepa: 91, is_hazmat: false, is_regulated: false },
    { asin: "B0HQR4P9TN", category: "美容", title: "ヘアブラシ ボリュームアップ 静電気防止 木製ハンドル", brand: "Mason Pearson系", current_price: 3680, weight_grams: 95, size_tier: "SMALL_STANDARD", review_count: 84, rating: 4.5, seller_count: 6, brand_strength: 22, monthly_sales: 116, gross_margin_pct: 42, decision: "CONDITIONAL_GO", score: 72, breakdown: { price: 25, size: 20, comp: 20, stab: 11, oem: 6 }, concern: "想定月販100個は超えるが余裕は薄い", seed_keepa: 101, is_hazmat: false, is_regulated: false },
    { asin: "B0J2KH8VRT", category: "DIY / 工具", title: "電動ドライバー 小型 USB-C充電 6.35mm ビット10本付属", brand: "Worx alt", current_price: 4980, weight_grams: 410, size_tier: "SMALL_STANDARD", review_count: 286, rating: 4.1, seller_count: 14, brand_strength: 48, monthly_sales: 194, gross_margin_pct: 24, decision: "NO_GO", score: 49, breakdown: { price: 25, size: 20, comp: 10, stab: 10, oem: 0 }, concern: "電子部品 + 認証必須。OEM適性最低水準", seed_keepa: 111, is_hazmat: true, is_regulated: false },
  ];
  const map = new Map<string, MockProductRow>();
  for (const p of products) map.set(p.asin, p);
  return map;
}

function seedDictionary(): DictionaryRow[] {
  const now = new Date().toISOString();
  return [
    { id: uuid(), type: "exclude_brand", value: "DAISO", note: "100均ブランドは利益が出ない", created_at: now },
    { id: uuid(), type: "exclude_brand", value: "Apple純正", note: "強ブランド独占", created_at: now },
    { id: uuid(), type: "exclude_category", value: "医薬部外品", note: "規制カテゴリは扱わない", created_at: now },
    { id: uuid(), type: "ng_pattern", value: "中古", note: "中古品は対象外", created_at: now },
    { id: uuid(), type: "ng_pattern", value: "訳あり", note: "訳あり品は除外", created_at: now },
    { id: uuid(), type: "promising_keyword", value: "本革 ステッチ", note: "差別化しやすい素材軸", created_at: now },
    { id: uuid(), type: "promising_keyword", value: "コンパクト デスクトレイ", note: "実績のあるキーワード", created_at: now },
  ];
}

function seedDiscoveryRuns(): DiscoveryRunRow[] {
  const now = new Date();
  const sub = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  return [
    {
      id: uuid(),
      category: "デスク周り / ガジェット",
      filters: { minPrice: 3000, maxPrice: 8000, maxReviews: 500, limit: 50, applyDictionary: true },
      generated_keywords: [
        "デスク 整理",
        "ケーブル ごちゃごちゃ 解消",
        "コンパクト デスクトレイ",
        "デスクマット セット",
        "在宅ワーク デスク",
        "モニター下 収納",
        "本革 デスク用品",
        "ガジェット 整理 木製",
      ],
      candidate_count: 12,
      candidates: [],
      excluded_candidates: [
        { asin: "B0XX1Y92AA", title: "シャープ 加湿空気清浄機 KI-RX75 大型タイプ", reason: "サイズ区分: 大型超" },
        { asin: "B0XX2Y31BB", title: "Anker PowerCore 26800 モバイルバッテリー 100W", reason: "危険物 (リチウム)" },
        { asin: "B0XX3T48CC", title: "ニトリ ベッドフレーム シングル 引き出し付き", reason: "重量過多 18,000g" },
        { asin: "B0XX4P11DD", title: "DAISO 100均ライト系 デスク収納 ホワイト", reason: "個人除外辞書: DAISO" },
        { asin: "B0XX5K70EE", title: "Apple純正 Magic Mouse 2 シルバー", reason: "強ブランド独占 91%" },
        { asin: "B0XX6L29FF", title: "化粧品 美白美容液 医薬部外品 30ml", reason: "規制カテゴリ: 化粧品" },
      ],
      duration_ms: 23000,
      source: "mock",
      created_at: sub(6),
    },
    {
      id: uuid(),
      category: "美容 / 健康",
      filters: { minPrice: 3000, maxPrice: 8000, maxReviews: 500, limit: 50, applyDictionary: true },
      generated_keywords: ["セルフケア 持ち運び", "むくみ ケア", "ハンディ サイズ", "ケアセット", "在宅ケア 道具"],
      candidate_count: 28,
      candidates: [],
      excluded_candidates: [],
      duration_ms: 41000,
      source: "mock",
      created_at: sub(20),
    },
    {
      id: uuid(),
      category: "キッチン雑貨",
      filters: { minPrice: 1500, maxPrice: 5000, maxReviews: 800, limit: 50, applyDictionary: true },
      generated_keywords: ["キッチン 整理", "洗いやすい 工夫", "コンパクト 軽量", "キッチンツール 5点セット"],
      candidate_count: 21,
      candidates: [],
      excluded_candidates: [],
      duration_ms: 32000,
      source: "mock",
      created_at: sub(28),
    },
  ];
}

function seedWatchlist(): Map<string, WatchlistRow> {
  const now = new Date().toISOString();
  const map = new Map<string, WatchlistRow>();
  const items: Array<Omit<WatchlistRow, "added_at" | "last_change">> = [
    { asin: "B0CXM7K2PQ", status: "sourcing", user_note: "OEM見積もり3社依頼済" },
    { asin: "B09JFR2T8L", status: "candidate", user_note: "価格帯やや低めだが回転良好" },
    { asin: "B0CLM4HRNV", status: "candidate", user_note: "パッケージ差別化を要検討" },
    { asin: "B0BMGQ2NXL", status: "candidate", user_note: "素材グレードでアップサイドあり" },
    { asin: "B0HQR4P9TN", status: "candidate", user_note: "月販ギリギリ — 監視継続" },
  ];
  for (const item of items) {
    map.set(item.asin, { ...item, added_at: now, last_change: null });
  }
  return map;
}

function seedAppSettings(): Map<string, AppSettingRow> {
  const now = new Date().toISOString();
  const map = new Map<string, AppSettingRow>();
  map.set("cache_only_mode", { key: "cache_only_mode", value: false, updated_at: now });
  map.set("cost_budget_jpy", { key: "cost_budget_jpy", value: 10000, updated_at: now });
  return map;
}

function seedApiUsage(): ApiUsageRow[] {
  const now = new Date();
  const items: ApiUsageRow[] = [];
  let hours = 0;
  const seedItems: Array<Pick<ApiUsageRow, "provider" | "endpoint" | "cost_estimate">> = [
    { provider: "keepa", endpoint: "/product", cost_estimate: 3420 },
    { provider: "gemini", endpoint: "models.generateContent", cost_estimate: 2180 },
    { provider: "spapi", endpoint: "Product Fees", cost_estimate: 1240 },
  ];
  for (const seed of seedItems) {
    items.push({
      id: uuid(),
      ...seed,
      occurred_at: new Date(now.getTime() - (hours += 6) * 3600 * 1000).toISOString(),
    });
  }
  return items;
}

export function getMockStore(): MockStoreState {
  if (!globalThis.__apdeMockStore) {
    globalThis.__apdeMockStore = {
      products: seedProducts(),
      watchlist: seedWatchlist(),
      dictionary: seedDictionary(),
      discoveryRuns: seedDiscoveryRuns(),
      analysis: [],
      apiUsage: seedApiUsage(),
      appSettings: seedAppSettings(),
      threads: [],
      feedback: new Map(),
    };
  }
  return globalThis.__apdeMockStore;
}

export const mockUuid = uuid;
