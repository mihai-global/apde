// Amazon JP 大カテゴリ → Keepa rootCategory ID マッピング。
// rootCategory ID は Keepa /category?category=0&domain=5 で実検証済み (2026-05-10)。
// 検証用エンドポイント: GET /api/ingest/categories (1 token)。
// 参考: https://www.amazon.co.jp/gp/site-directory

export interface AppCategory {
  /** アプリ内 slug (URL/設定で使う) */
  id: string;
  /** UI 表示名 */
  label: string;
  /** Keepa /query の rootCategory フィルタに渡す Amazon ノード ID (実測値) */
  keepaRootCategory: number;
}

export const CATEGORIES: ReadonlyArray<AppCategory> = [
  // ─── 主要 14 カテゴリ (Amazon JP 大分類) ──────────────────────────────
  { id: "home-kitchen", label: "ホーム&キッチン", keepaRootCategory: 3828871 },
  { id: "electronics", label: "家電&カメラ", keepaRootCategory: 3210981 },
  { id: "pc-peripherals", label: "パソコン・周辺機器", keepaRootCategory: 2127209051 },
  { id: "office-stationery", label: "文房具・オフィス用品", keepaRootCategory: 86731051 },
  { id: "diy-tools", label: "DIY・工具・ガーデン", keepaRootCategory: 2016929051 },
  { id: "sports-outdoors", label: "スポーツ&アウトドア", keepaRootCategory: 14304371 },
  { id: "beauty", label: "ビューティー", keepaRootCategory: 52374051 },
  { id: "drugstore", label: "ドラッグストア", keepaRootCategory: 160384011 },
  { id: "fashion", label: "ファッション", keepaRootCategory: 2229202051 },
  { id: "baby", label: "ベビー&マタニティ", keepaRootCategory: 344845011 },
  { id: "pet-supplies", label: "ペット用品", keepaRootCategory: 2127212051 },
  { id: "hobby", label: "ホビー", keepaRootCategory: 2277721051 },
  { id: "toys", label: "おもちゃ", keepaRootCategory: 13299531 },
  { id: "food-drink", label: "食品・飲料・お酒", keepaRootCategory: 57239051 },
];

/**
 * UI から渡されるカテゴリ識別子 (id または label) を解決する。
 * レガシーカテゴリ (例: 「デスク周り / ガジェット」) も label の前方一致で受ける。
 */
export function findCategory(idOrLabel: string): AppCategory | undefined {
  const trimmed = idOrLabel.trim();
  if (!trimmed) return undefined;
  return (
    CATEGORIES.find((c) => c.id === trimmed) ??
    CATEGORIES.find((c) => c.label === trimmed) ??
    CATEGORIES.find((c) => trimmed.startsWith(c.label))
  );
}

export const DEFAULT_CATEGORY: AppCategory = CATEGORIES[0]!;

/**
 * Keepa の rootCategory (数値 ID) から、 14 カテゴリの label を逆引きする。
 * `products.category` を統一する目的で ingestDiscover / ingestDiff が使う。
 * 該当なし (Keepa 側で別 root を返してきた場合) は undefined。
 */
export function resolveRootCategoryLabel(rootId: number | undefined | null): string | undefined {
  if (typeof rootId !== "number") return undefined;
  return CATEGORIES.find((c) => c.keepaRootCategory === rootId)?.label;
}
