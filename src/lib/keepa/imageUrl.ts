// Amazon CDN 画像 URL に「サイズヒント」を埋め込むユーティリティ。
// Keepa の imagesCSV は basename だけなので、 `keepaImagesToUrls()` で
// `https://m.media-amazon.com/images/I/{file}.jpg` 形式に変換されている。
//
// Amazon CDN は basename の拡張子直前に `._SL{N}_` などのサフィックスを挟むと
// サーバ側で自動リサイズした画像を返す。例:
//   原寸: https://m.media-amazon.com/images/I/61abc.jpg
//   216:  https://m.media-amazon.com/images/I/61abc._SL216_.jpg
//
// next/image の `sizes` 属性と組み合わせると、 srcSet で複数解像度を提供できる。

/**
 * 元の Amazon CDN URL に `_SL{size}_` を挿入する。
 * - URL が Amazon CDN でない場合は素通し
 * - すでにサイズヒントが入っていた場合は新しい値で置換
 */
export function withAmazonImageSize(url: string, size: number): string {
  if (!url) return url;
  if (!/m\.media-amazon\.com|images-(na|fe)\.ssl-images-amazon\.com/.test(url)) return url;

  // 既存のサイズヒントがあれば置き換える (例: _SL480_, _AC_UL320_)
  const stripped = url.replace(/\._?(SL|AC_UL|UL|SS|SX|SY)\d+_?/gi, "");
  return stripped.replace(/(\.(jpg|jpeg|png|gif|webp))(\?.*)?$/i, (_m, ext, _e, query) => {
    return `._SL${size}_${ext}${query ?? ""}`;
  });
}

/**
 * 複数解像度バリアントを返す。 next/image の `sizes` と組み合わせると srcSet が機能する。
 * 戻り値は `srcSet` 文字列 (例: `"url 1x, url 2x"`)。
 */
export function amazonImageSrcSet(url: string, sizes: number[] = [144, 216, 320, 480]): string {
  if (!url) return "";
  return sizes.map((s) => `${withAmazonImageSize(url, s)} ${s}w`).join(", ");
}

/**
 * 1×1 グレーピクセルの base64 (placeholder="blur" の blurDataURL に使う固定値)。
 * 動的にハッシュから色を変えても良いが、 LCP に影響しないよう超軽量で固定にしておく。
 */
export const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4=";

/**
 * ASIN からハッシュ色 (HSL) を決定。 同じ ASIN → 同じ色なので一覧でちらつかない。
 * プレースホルダー背景に使う。 H は 0-359、 S/L は読みやすさ重視で固定。
 */
export function asinToHslBackground(asin: string): string {
  let h = 0;
  for (let i = 0; i < asin.length; i++) {
    h = (h * 31 + asin.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 24% 88%)`;
}
