// Discovery / Search で共通利用する価格帯定義 (R7)。
//
// R6 までは `db/discovery_seed.sql` と `enqueueDiscoverySeeds()` の 2 箇所で
// 同じ 4 バンドをハードコードしていた。 R7 で `/discovery` のヒートマップが
// この同じ区切りを必要としたので、 一次ソースを本ファイルに集約する。
//
// バンドの上限は **EXCLUSIVE** (max=2000 は 2000 円ぴったりを含まない)。
// `ingestDiscover` が Keepa /query に渡す `current_NEW_gte/lte` は
// inclusive なので、 マッピング時は 1 円減らすか、 そのまま渡しても
// 1 円の誤差は事実上問題なし (Keepa の整数 yen 単位なので)。

export type PriceBandId = "0-2000" | "2000-5000" | "5000-15000" | "15000-50000";

export interface PriceBand {
  id: PriceBandId;
  /** UI 用の長いラベル (フィルタ表示など) */
  label: string;
  /** ヒートマップなど狭いセル用の短いラベル */
  shortLabel: string;
  /** 価格 (yen) 下限 (INCLUSIVE) */
  min: number;
  /** 価格 (yen) 上限 (EXCLUSIVE) */
  max: number;
}

export const PRICE_BANDS: ReadonlyArray<PriceBand> = [
  { id: "0-2000",      label: "〜¥2,000",        shortLabel: "<2k",    min: 0,     max: 2000 },
  { id: "2000-5000",   label: "¥2,000–5,000",    shortLabel: "2-5k",   min: 2000,  max: 5000 },
  { id: "5000-15000",  label: "¥5,000–15,000",   shortLabel: "5-15k",  min: 5000,  max: 15000 },
  { id: "15000-50000", label: "¥15,000–50,000",  shortLabel: "15-50k", min: 15000, max: 50000 },
];

/**
 * 価格 (yen) を該当バンドに振り分ける。 範囲外 (例: ¥0 や ¥60,000) は undefined。
 * null / 未取得は undefined を返す。
 */
export function priceToBand(yen: number | null | undefined): PriceBand | undefined {
  if (typeof yen !== "number" || yen < 0) return undefined;
  return PRICE_BANDS.find((b) => yen >= b.min && yen < b.max);
}

/** id から逆引き。 不明値は undefined。 */
export function bandById(id: string): PriceBand | undefined {
  return PRICE_BANDS.find((b) => b.id === id);
}
