// Amazon JP 大カテゴリ → Keepa rootCategory ID マッピング。
// rootCategory ID は実装時に Keepa /category API で確認 (ズレが発覚したら更新)。
// 参考: https://www.amazon.co.jp/gp/site-directory

export interface AppCategory {
  /** アプリ内 slug (URL/設定で使う) */
  id: string;
  /** UI 表示名 */
  label: string;
  /** Keepa /query の rootCategory フィルタに渡す Amazon ID */
  keepaRootCategory: number;
}

export const CATEGORIES: ReadonlyArray<AppCategory> = [
  { id: "home-kitchen", label: "ホーム&キッチン", keepaRootCategory: 2127209051 },
  { id: "office-stationery", label: "文房具・オフィス用品", keepaRootCategory: 2127194051 },
  { id: "electronics", label: "家電&カメラ", keepaRootCategory: 2127188051 },
  { id: "pet-supplies", label: "ペット用品", keepaRootCategory: 2127185051 },
  { id: "sports-outdoors", label: "スポーツ&アウトドア", keepaRootCategory: 2127208051 },
  { id: "beauty", label: "ビューティー", keepaRootCategory: 2127197051 },
  { id: "health-personal-care", label: "ヘルス&ビューティ", keepaRootCategory: 2127190051 },
  { id: "diy-tools", label: "DIY・工具・ガーデン", keepaRootCategory: 2127189051 },
  { id: "fashion", label: "服&ファッション小物", keepaRootCategory: 2127183051 },
  { id: "baby", label: "ベビー&マタニティ", keepaRootCategory: 2127186051 },
  { id: "hobby", label: "ホビー", keepaRootCategory: 2127196051 },
  { id: "toys", label: "おもちゃ", keepaRootCategory: 2127207051 },
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
