import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  images: {
    // Amazon 商品画像 (Keepa imagesCsv 由来) の最適化を許可
    remotePatterns: [
      { protocol: "https", hostname: "m.media-amazon.com", pathname: "/images/**" },
      { protocol: "https", hostname: "images-na.ssl-images-amazon.com", pathname: "/images/**" },
      { protocol: "https", hostname: "images-fe.ssl-images-amazon.com", pathname: "/images/**" },
    ],
  },
};

export default nextConfig;
