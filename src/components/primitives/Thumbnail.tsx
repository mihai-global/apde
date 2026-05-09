"use client";

import Image from "next/image";
import { useState } from "react";
import { ThumbPlaceholder } from "./ThumbPlaceholder";

interface ThumbnailProps {
  /** 商品画像 URL (Keepa imagesCSV 由来)。未指定 or ロード失敗時はプレースホルダーへフォールバック */
  src?: string | null;
  /** 代替テキスト (商品名推奨) */
  alt: string;
  /** プレースホルダーのバリエーション seed (画像なし時のみ使用) */
  seed?: number;
  /** 表示サイズ (px)。デフォルト 48 */
  size?: number;
}

export function Thumbnail({ src, alt, seed = 1, size = 48 }: ThumbnailProps) {
  const [errored, setErrored] = useState(false);
  const showImage = !!src && !errored;
  return (
    <div className="thumb" style={{ width: size, height: size }}>
      {showImage ? (
        <Image
          src={src as string}
          alt={alt}
          width={size}
          height={size}
          sizes={`${size}px`}
          loading="lazy"
          onError={() => setErrored(true)}
          style={{ objectFit: "contain", width: "100%", height: "100%" }}
          unoptimized={false}
        />
      ) : (
        <ThumbPlaceholder seed={seed} />
      )}
    </div>
  );
}
