// Brand / category policy: モックの seed 由来値を「現実の市場常識」で上書きする。
// 例: KIOXIA microSD なら brandStrength=85 / oemFeasibility=10 / complexity=HIGH。
// LLM 解析を呼ばない discovery でもまともな判定を出すための最低限の知識ベース。
//
// 拡張方針:
//   - 新規 brand を見つけたら STRONG_BRANDS に追加 (key: 大文字一致 or 部分文字列)
//   - 新規 category 規制を見つけたら CATEGORY_PATTERNS に追加
//   - LLM enrichment が走るようになったら、この policy は override から「ヒント」に格下げ
import type { AsinMetrics, RiskLevel } from "@/lib/types";

export interface BrandPolicy {
  /** 0-100。実勢ブランドシェアを反映 */
  strength?: number;
  /** 0-100。 OEM で同等品を作れるか (低いほど難しい) */
  oemFeasibility?: number;
  /** 0-100。 デザイン / セット化等で差別化できるか (低いほど難しい) */
  differentiation?: number;
  /** 技術的な再現難度 */
  complexity?: RiskLevel;
}

/**
 * 強ブランド辞書。 key は大文字または日本語表記の **substring**。
 * brand 文字列に含まれていれば policy を適用する。
 *
 * 商材カテゴリの暗黙仮定:
 *   - 半導体・電池: oem 不可、complexity HIGH
 *   - 家電大手: brand 強・oem 中
 *   - ファッション ラグジュアリ: brand 強・差別化なし
 *   - 化粧品 大手: brand 強・regulated
 */
const STRONG_BRANDS: Record<string, BrandPolicy> = {
  // ─── Memory / Storage / 半導体 (OEM ほぼ不可) ─────────────────────────
  KIOXIA: { strength: 85, oemFeasibility: 8, differentiation: 10, complexity: "HIGH" },
  キオクシア: { strength: 85, oemFeasibility: 8, differentiation: 10, complexity: "HIGH" },
  SANDISK: { strength: 90, oemFeasibility: 8, differentiation: 10, complexity: "HIGH" },
  SAMSUNG: { strength: 92, oemFeasibility: 8, differentiation: 10, complexity: "HIGH" },
  CRUCIAL: { strength: 75, oemFeasibility: 10, differentiation: 12, complexity: "HIGH" },
  LEXAR: { strength: 70, oemFeasibility: 12, differentiation: 15, complexity: "HIGH" },
  ADATA: { strength: 65, oemFeasibility: 14, differentiation: 18, complexity: "HIGH" },
  TRANSCEND: { strength: 70, oemFeasibility: 14, differentiation: 15, complexity: "HIGH" },
  "WESTERN DIGITAL": { strength: 80, oemFeasibility: 10, differentiation: 12, complexity: "HIGH" },
  SEAGATE: { strength: 75, oemFeasibility: 10, differentiation: 12, complexity: "HIGH" },

  // ─── Audio / Apple ecosystem ─────────────────────────────────────────
  APPLE: { strength: 95, oemFeasibility: 5, differentiation: 8, complexity: "HIGH" },
  SONY: { strength: 90, oemFeasibility: 12, differentiation: 18, complexity: "HIGH" },
  BOSE: { strength: 85, oemFeasibility: 12, differentiation: 18, complexity: "HIGH" },
  JBL: { strength: 75, oemFeasibility: 18, differentiation: 25, complexity: "MEDIUM" },
  ANKER: { strength: 78, oemFeasibility: 15, differentiation: 20, complexity: "MEDIUM" },
  BEATS: { strength: 82, oemFeasibility: 10, differentiation: 15, complexity: "HIGH" },
  "AUDIO-TECHNICA": { strength: 75, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  SENNHEISER: { strength: 80, oemFeasibility: 15, differentiation: 18, complexity: "HIGH" },
  AKG: { strength: 70, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },

  // ─── Camera / Imaging ────────────────────────────────────────────────
  CANON: { strength: 90, oemFeasibility: 5, differentiation: 8, complexity: "HIGH" },
  NIKON: { strength: 88, oemFeasibility: 5, differentiation: 8, complexity: "HIGH" },
  FUJIFILM: { strength: 80, oemFeasibility: 5, differentiation: 10, complexity: "HIGH" },
  GOPRO: { strength: 78, oemFeasibility: 8, differentiation: 12, complexity: "HIGH" },

  // ─── Home / Kitchen / 大手家電 ────────────────────────────────────────
  PANASONIC: { strength: 85, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  パナソニック: { strength: 85, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  TOSHIBA: { strength: 78, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  東芝: { strength: 78, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  HITACHI: { strength: 78, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  日立: { strength: 78, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  SHARP: { strength: 75, oemFeasibility: 22, differentiation: 28, complexity: "MEDIUM" },
  シャープ: { strength: 75, oemFeasibility: 22, differentiation: 28, complexity: "MEDIUM" },
  MITSUBISHI: { strength: 78, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  三菱: { strength: 78, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  DAIKIN: { strength: 80, oemFeasibility: 12, differentiation: 18, complexity: "HIGH" },
  ダイキン: { strength: 80, oemFeasibility: 12, differentiation: 18, complexity: "HIGH" },
  DYSON: { strength: 88, oemFeasibility: 8, differentiation: 12, complexity: "HIGH" },
  ダイソン: { strength: 88, oemFeasibility: 8, differentiation: 12, complexity: "HIGH" },
  IROBOT: { strength: 82, oemFeasibility: 12, differentiation: 18, complexity: "HIGH" },
  TIGER: { strength: 70, oemFeasibility: 28, differentiation: 32, complexity: "MEDIUM" },
  タイガー: { strength: 70, oemFeasibility: 28, differentiation: 32, complexity: "MEDIUM" },
  ZOJIRUSHI: { strength: 72, oemFeasibility: 25, differentiation: 30, complexity: "MEDIUM" },
  象印: { strength: 72, oemFeasibility: 25, differentiation: 30, complexity: "MEDIUM" },
  TEFAL: { strength: 72, oemFeasibility: 25, differentiation: 30, complexity: "MEDIUM" },
  "T-FAL": { strength: 72, oemFeasibility: 25, differentiation: 30, complexity: "MEDIUM" },
  "DE'LONGHI": { strength: 75, oemFeasibility: 22, differentiation: 28, complexity: "MEDIUM" },
  PHILIPS: { strength: 80, oemFeasibility: 18, differentiation: 22, complexity: "MEDIUM" },
  BRAUN: { strength: 75, oemFeasibility: 22, differentiation: 28, complexity: "MEDIUM" },

  // ─── PC / 周辺機器 (一部 OEM 余地あり) ──────────────────────────────
  MICROSOFT: { strength: 90, oemFeasibility: 8, differentiation: 12, complexity: "HIGH" },
  DELL: { strength: 75, oemFeasibility: 18, differentiation: 22, complexity: "HIGH" },
  HP: { strength: 78, oemFeasibility: 18, differentiation: 22, complexity: "HIGH" },
  LENOVO: { strength: 78, oemFeasibility: 18, differentiation: 22, complexity: "HIGH" },
  ASUS: { strength: 72, oemFeasibility: 22, differentiation: 28, complexity: "HIGH" },
  ACER: { strength: 65, oemFeasibility: 25, differentiation: 30, complexity: "MEDIUM" },
  RAZER: { strength: 70, oemFeasibility: 22, differentiation: 28, complexity: "MEDIUM" },
  LOGICOOL: { strength: 78, oemFeasibility: 25, differentiation: 30, complexity: "MEDIUM" },
  LOGITECH: { strength: 78, oemFeasibility: 25, differentiation: 30, complexity: "MEDIUM" },

  // ─── Mobile ─────────────────────────────────────────────────────────
  XIAOMI: { strength: 75, oemFeasibility: 12, differentiation: 18, complexity: "HIGH" },
  GOOGLE: { strength: 88, oemFeasibility: 10, differentiation: 15, complexity: "HIGH" },

  // ─── Battery (PSE 必要) ─────────────────────────────────────────────
  ENERGIZER: { strength: 70, oemFeasibility: 22, differentiation: 28, complexity: "MEDIUM" },
  DURACELL: { strength: 70, oemFeasibility: 22, differentiation: 28, complexity: "MEDIUM" },
  MAXELL: { strength: 65, oemFeasibility: 28, differentiation: 32, complexity: "MEDIUM" },

  // ─── Cosmetics (大半は regulated category 側で拾うが、強ブランドのみ) ─
  SHISEIDO: { strength: 88, oemFeasibility: 18, differentiation: 25, complexity: "HIGH" },
  資生堂: { strength: 88, oemFeasibility: 18, differentiation: 25, complexity: "HIGH" },
  KOSE: { strength: 80, oemFeasibility: 22, differentiation: 28, complexity: "HIGH" },
  コーセー: { strength: 80, oemFeasibility: 22, differentiation: 28, complexity: "HIGH" },
  KANEBO: { strength: 78, oemFeasibility: 22, differentiation: 28, complexity: "HIGH" },
  カネボウ: { strength: 78, oemFeasibility: 22, differentiation: 28, complexity: "HIGH" },

  // ─── Sports ─────────────────────────────────────────────────────────
  NIKE: { strength: 92, oemFeasibility: 12, differentiation: 18, complexity: "MEDIUM" },
  ADIDAS: { strength: 90, oemFeasibility: 14, differentiation: 20, complexity: "MEDIUM" },
  MIZUNO: { strength: 78, oemFeasibility: 22, differentiation: 28, complexity: "MEDIUM" },
  ASICS: { strength: 80, oemFeasibility: 20, differentiation: 25, complexity: "MEDIUM" },
  PUMA: { strength: 78, oemFeasibility: 22, differentiation: 28, complexity: "MEDIUM" },

  // ─── Watches ────────────────────────────────────────────────────────
  CASIO: { strength: 80, oemFeasibility: 18, differentiation: 22, complexity: "HIGH" },
  カシオ: { strength: 80, oemFeasibility: 18, differentiation: 22, complexity: "HIGH" },
  SEIKO: { strength: 85, oemFeasibility: 12, differentiation: 18, complexity: "HIGH" },
  CITIZEN: { strength: 80, oemFeasibility: 15, differentiation: 22, complexity: "HIGH" },
};

export function lookupBrandPolicy(brand: string | undefined | null): BrandPolicy | null {
  if (!brand) return null;
  const upper = brand.toUpperCase().trim();
  for (const [key, policy] of Object.entries(STRONG_BRANDS)) {
    if (upper.includes(key.toUpperCase())) return policy;
    if (brand.includes(key)) return policy; // 日本語ブランド (大文字化されない)
  }
  return null;
}

export interface CategoryPolicy {
  isRegulated?: boolean;
  isHazmat?: boolean;
  complexity?: RiskLevel;
  /** 上限 (これ以下に下げる) */
  maxOemFeasibility?: number;
  /** 上限 (これ以下に下げる) */
  maxDifferentiation?: number;
  /** 下限 (これ以上に上げる) */
  minBrandStrength?: number;
}

/**
 * カテゴリ + タイトルの substring パターン。 半導体メモリやリチウム電池など
 * カテゴリそのものが OEM 不可・規制対象であるケースをここで拾う。
 */
const CATEGORY_PATTERNS: Array<[RegExp, CategoryPolicy]> = [
  // 半導体メモリ・ストレージ
  [
    /microSD|SDカード|SD カード|USBメモリ|USB メモリ|SSD|HDD|フラッシュメモリ|メモリーカード|メモリカード|SD ?XC|microSDXC/i,
    { complexity: "HIGH", maxOemFeasibility: 10, maxDifferentiation: 12, minBrandStrength: 60 },
  ],
  // バッテリー / リチウム
  [
    /モバイルバッテリー|リチウム|充電池|蓄電池|大容量バッテリー/i,
    { isHazmat: true, complexity: "HIGH", maxOemFeasibility: 30, minBrandStrength: 50 },
  ],
  // 家電 (PSE 認証必要)
  [
    /電源アダプター|急速充電|ドライヤー|電動歯ブラシ|シェーバー|電気ケトル|炊飯器/i,
    { complexity: "MEDIUM", maxOemFeasibility: 35 },
  ],
  // 医薬・化粧品
  [
    /医薬品|医薬部外品|美容液|化粧水|乳液|シャンプー|コンディショナー|歯磨き粉|目薬|サプリメント|サプリ/i,
    { isRegulated: true, complexity: "MEDIUM" },
  ],
  // 食品・飲料
  [
    /食品|飲料|お茶|コーヒー豆|健康食品|プロテイン|ハーブティ/i,
    { isRegulated: true },
  ],
  // 玩具 (子供向け、ST マーク等)
  [
    /おもちゃ|玩具|知育|ベビー用品/i,
    { isRegulated: true, maxOemFeasibility: 50 },
  ],
];

export function lookupCategoryPolicy(
  category: string | undefined | null,
  title: string | undefined | null,
): CategoryPolicy | null {
  const haystack = [category, title].filter(Boolean).join(" ");
  if (!haystack) return null;
  for (const [pattern, policy] of CATEGORY_PATTERNS) {
    if (pattern.test(haystack)) return policy;
  }
  return null;
}

/**
 * ブランド + カテゴリ ポリシーを AsinMetrics に適用する。
 * mock 値より厳しい方向 (= シェア高 / OEM 困難 / 規制) に倒す。
 * Keepa から取れない構造系指標が現実離れするのを抑える。
 */
export function applyBrandPolicy(metrics: AsinMetrics): AsinMetrics {
  const out = { ...metrics };

  const bp = lookupBrandPolicy(metrics.brand);
  if (bp) {
    if (bp.strength !== undefined) {
      out.brandStrength = Math.max(out.brandStrength, bp.strength);
    }
    if (bp.oemFeasibility !== undefined) {
      out.oemFeasibility = Math.min(out.oemFeasibility, bp.oemFeasibility);
    }
    if (bp.differentiation !== undefined) {
      out.differentiationPotential = Math.min(out.differentiationPotential, bp.differentiation);
    }
    if (bp.complexity) {
      // HIGH > MEDIUM > LOW 優先
      if (bp.complexity === "HIGH" || (bp.complexity === "MEDIUM" && out.complexityRisk === "LOW")) {
        out.complexityRisk = bp.complexity;
      }
    }
  }

  const cp = lookupCategoryPolicy(metrics.category, metrics.title);
  if (cp) {
    if (cp.isHazmat) out.isHazmat = true;
    if (cp.isRegulated) out.isRegulated = true;
    if (cp.complexity === "HIGH") out.complexityRisk = "HIGH";
    if (cp.complexity === "MEDIUM" && out.complexityRisk === "LOW") {
      out.complexityRisk = "MEDIUM";
    }
    if (cp.maxOemFeasibility !== undefined) {
      out.oemFeasibility = Math.min(out.oemFeasibility, cp.maxOemFeasibility);
    }
    if (cp.maxDifferentiation !== undefined) {
      out.differentiationPotential = Math.min(out.differentiationPotential, cp.maxDifferentiation);
    }
    if (cp.minBrandStrength !== undefined) {
      out.brandStrength = Math.max(out.brandStrength, cp.minBrandStrength);
    }
  }

  return out;
}
