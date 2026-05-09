// 探索段階の自動除外 (要件 v1.1 §4.1)。学習辞書とハードルールの両方を適用する。
import type { AsinMetrics, DictionaryRow, ExcludedCandidate } from "@/lib/types";

export interface ExclusionInput {
  metrics: AsinMetrics;
  dictionary: DictionaryRow[];
}

export interface ExclusionResult {
  excluded: boolean;
  reason?: string;
}

const HAZMAT_KEYWORDS = ["リチウム", "モバイルバッテリー", "化粧品", "医薬部外品"];

export function evaluateExclusion(input: ExclusionInput): ExclusionResult {
  const { metrics, dictionary } = input;

  if (metrics.weightGrams > 1000) {
    return { excluded: true, reason: `重量過多 ${metrics.weightGrams.toLocaleString("ja-JP")}g` };
  }
  if (metrics.sizeTier === "OVERSIZE") {
    return { excluded: true, reason: "サイズ区分: 大型超" };
  }
  if (metrics.isHazmat) {
    return { excluded: true, reason: "危険物" };
  }
  if (metrics.isRegulated) {
    return { excluded: true, reason: `規制カテゴリ: ${metrics.category}` };
  }
  if (metrics.brandStrength >= 80) {
    return { excluded: true, reason: `強ブランド独占 ${Math.round(metrics.brandStrength)}%` };
  }

  const lowerTitle = metrics.title.toLowerCase();
  if (HAZMAT_KEYWORDS.some((k) => metrics.title.includes(k))) {
    return { excluded: true, reason: "危険物 / 規制キーワード一致" };
  }

  for (const entry of dictionary) {
    if (entry.type === "exclude_brand" && metrics.brand && metrics.brand.includes(entry.value)) {
      return { excluded: true, reason: `個人除外辞書: ${entry.value}` };
    }
    if (entry.type === "exclude_category" && metrics.category.includes(entry.value)) {
      return { excluded: true, reason: `個人除外カテゴリ: ${entry.value}` };
    }
    if (entry.type === "ng_pattern") {
      try {
        const regex = new RegExp(entry.value, "i");
        if (regex.test(lowerTitle)) {
          return { excluded: true, reason: `NG パターン一致: ${entry.value}` };
        }
      } catch {
        // regex が無効なら部分一致で確認
        if (lowerTitle.includes(entry.value.toLowerCase())) {
          return { excluded: true, reason: `NG パターン一致: ${entry.value}` };
        }
      }
    }
  }

  return { excluded: false };
}

export function toExcludedCandidate(metrics: AsinMetrics, reason: string): ExcludedCandidate {
  return { asin: metrics.asin, title: metrics.title, reason };
}
