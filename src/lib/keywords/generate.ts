// 5軸キーワード生成 (要件 v1.1 §4.1)。
// 用途 / 問題解決 / サイズ / セット / 利用シーン を必ず含むよう 8 件以上を返す。
// 実装はテンプレートベースだが、env.llm.configured が true の場合は将来 LLM 呼び出しに差し替え可能。

const CATEGORY_LIBRARY: Record<string, { use?: string; problem?: string; size?: string; set?: string; scene?: string }> = {
  "デスク周り": {
    use: "デスク 整理",
    problem: "ケーブル ごちゃごちゃ 解消",
    size: "コンパクト デスクトレイ",
    set: "デスクマット セット",
    scene: "在宅ワーク デスク",
  },
  "デスク周り / ガジェット": {
    use: "デスク 整理",
    problem: "ケーブル ごちゃごちゃ 解消",
    size: "コンパクト デスクトレイ",
    set: "デスクマット セット",
    scene: "在宅ワーク デスク",
  },
  "キッチン": {
    use: "保存容器 セット",
    problem: "時短調理 工夫",
    size: "コンパクト 折りたたみ",
    set: "キッチンツール セット",
    scene: "ひとり暮らし キッチン",
  },
  "キッチン雑貨": {
    use: "キッチン 整理",
    problem: "洗いやすい 工夫",
    size: "コンパクト 軽量",
    set: "キッチンツール 5点セット",
    scene: "一人暮らし キッチン",
  },
  "美容": {
    use: "持ち運び ケア",
    problem: "肌荒れ 改善",
    size: "ミニサイズ 静音",
    set: "ケア 3点セット",
    scene: "出張 美容ケア",
  },
  "美容 / 健康": {
    use: "セルフケア 持ち運び",
    problem: "むくみ ケア",
    size: "ハンディ サイズ",
    set: "ケアセット",
    scene: "在宅ケア 道具",
  },
  "アウトドア": {
    use: "キャンプ 軽量",
    problem: "雨対策 防水",
    size: "折りたたみ 軽量",
    set: "アウトドア セット",
    scene: "ソロキャンプ 道具",
  },
  "ペット": {
    use: "ペット 給餌",
    problem: "留守番 工夫",
    size: "省スペース ペット",
    set: "猫 用品セット",
    scene: "在宅勤務 ペット",
  },
  "ペット用品": {
    use: "ペット 給餌",
    problem: "留守番 工夫",
    size: "省スペース ペット",
    set: "猫 用品セット",
    scene: "在宅勤務 ペット",
  },
  "文房具": {
    use: "ノート 整理",
    problem: "字 書きやすい",
    size: "A5 コンパクト",
    set: "文具 セット",
    scene: "学習用 文房具",
  },
  "収納": {
    use: "収納ボックス 整理",
    problem: "片付かない 解消",
    size: "スタッキング 省スペース",
    set: "収納ボックス 3個セット",
    scene: "クローゼット 整理",
  },
  "収納 / 整理": {
    use: "収納ボックス 整理",
    problem: "片付かない 解消",
    size: "スタッキング 省スペース",
    set: "収納ボックス 3個セット",
    scene: "クローゼット 整理",
  },
  "DIY": {
    use: "電動ドライバー DIY",
    problem: "ねじ なめにくい",
    size: "小型 USB-C",
    set: "ビット 10本セット",
    scene: "家庭 DIY",
  },
  "DIY / 工具": {
    use: "電動ドライバー DIY",
    problem: "ねじ なめにくい",
    size: "小型 USB-C",
    set: "ビット 10本セット",
    scene: "家庭 DIY",
  },
};

const FALLBACK = {
  use: "おすすめ",
  problem: "改善 工夫",
  size: "コンパクト 軽量",
  set: "セット",
  scene: "日常使い",
} as const;

export interface KeywordSet {
  keywords: string[];
  axes: { use: string; problem: string; size: string; set: string; scene: string };
}

export function generateKeywords(category: string): KeywordSet {
  const normalized = category.trim();
  const lib = CATEGORY_LIBRARY[normalized] ?? {};
  const axes = {
    use: lib.use ?? `${normalized} ${FALLBACK.use}`,
    problem: lib.problem ?? `${normalized} ${FALLBACK.problem}`,
    size: lib.size ?? `${normalized} ${FALLBACK.size}`,
    set: lib.set ?? `${normalized} ${FALLBACK.set}`,
    scene: lib.scene ?? `${normalized} ${FALLBACK.scene}`,
  };
  const extras = [
    `${normalized} OEM`,
    `${normalized} レビュー少なめ`,
    `${normalized} 持ち運び`,
  ];
  return {
    keywords: [axes.use, axes.problem, axes.size, axes.set, axes.scene, ...extras].slice(0, 10),
    axes,
  };
}
