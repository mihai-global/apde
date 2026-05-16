"use client";

import Image from "next/image";
import { useState } from "react";
import { BLUR_DATA_URL, withAmazonImageSize } from "@/lib/keepa/imageUrl";
import { ThumbPlaceholder } from "./ThumbPlaceholder";

interface ThumbnailProps {
  /** 商品画像 URL (Keepa imagesCSV 由来)。未指定 or ロード失敗時はプレースホルダーへフォールバック */
  src?: string | null;
  /** 代替テキスト (商品名推奨) */
  alt: string;
  /** プレースホルダーのバリエーション seed (画像なし時のみ使用) */
  seed?: number;
  /** プレースホルダーのラベル (ASIN 先頭 2 文字など)。 未指定で seed 図形にフォールバック */
  label?: string;
  /** 表示サイズ (px)。デフォルト 72 (R6 で 48 → 72 にアップ) */
  size?: number;
}

/**
 * R6 改修:
 *  - デフォルト 48 → 72px に拡大 (一覧の視認性向上)
 *  - Amazon CDN のサイズヒント `_SL{N}_` を URL に注入し、 retina 用に 2× 解像度を読む
 *  - placeholder="blur" で LCP 中のチラつきを抑える
 *  - プレースホルダーに `label` (ASIN 先頭 2 文字) を渡せるように拡張
 */
export function Thumbnail({ src, alt, seed = 1, label, size = 72 }: ThumbnailProps) {
  const [errored, setErrored] = useState(false);
  const showImage = !!src && !errored;

  // retina 想定で 2× のサイズヒントを Amazon CDN に渡す。これにより
  // 物理ピクセル density が高い画面でも常にシャープな画像が読まれる。
  const remoteUrl = showImage ? withAmazonImageSize(src as string, size * 2) : null;

  return (
    <div className="thumb" style={{ width: size, height: size }}>
      {showImage && remoteUrl ? (
        <Image
          src={remoteUrl}
          alt={alt}
          width={size}
          height={size}
          sizes={`${size}px`}
          loading="lazy"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          onError={() => setErrored(true)}
          style={{ objectFit: "contain", width: "100%", height: "100%" }}
        />
      ) : (
        <ThumbPlaceholder seed={seed} label={label} />
      )}
    </div>
  );
}
