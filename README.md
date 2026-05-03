# Amazon Product Discovery Engine

Amazon FBA / OEM向けに、カテゴリ入力から商品候補の発掘、ASIN分析、GO / NO-GO判断までを一気通しで行う Next.js MVP です。

## 実装した範囲

- カテゴリ、価格帯、レビュー条件による商品探索API
- 構造ルールベースの5軸スコアリング
  - 価格適正 `0-25`
  - サイズ効率 `0-20`
  - 競争余地 `0-20`
  - 価格安定性 `0-15`
  - OEM適性 `0-20`
- ゲート判定
  - 粗利率
  - 広告耐性
  - 回転率
  - 差別化余地
  - 規制・権利リスク
- `GO / 条件付きGO / NO-GO` 判定
- 商品一覧UI
  - 商品名
  - スコア
  - 想定月商
  - 競争レベル
  - 判定
- 商品詳細UI
  - 結論
  - 理由3点
  - 主要リスク
  - 推移グラフ
  - 次アクション
  - LLM分析欄
- 24時間TTLキャッシュ
- 定期更新用の `/api/refresh` エンドポイント雛形
- Supabase向けSQLスキーマ

## 現在の実装方針

このリポジトリは、外部API未接続でも画面と判定ロジックを先に検証できるように、`mock` / `hybrid` を返すMVP構成にしています。

判定思想は「経験則」ではなく、以下の構造ルールを優先しています。

- 価格は `¥3,000〜¥8,000` を最優先
- `500g以下` かつ小型を優先
- 粗利率 `40〜60%` を理想値として評価
- レビュー `100〜500` の中程度競争を優先
- Keepa上の価格崩壊を強く減点
- 差別化余地とOEM再現性を評価
- 月販 `100個以上` を回転率の目安に使用
- 法規制、特許、技術難度が高い商品は落選寄りに判定

- `KEEPA_API_KEY` 未設定時
  - Keepa相当のモック時系列を生成
- `GEMINI_API_KEY` 未設定時
  - 戦略レポートはフォールバック生成
- そのため現時点でも探索から判断UIまで一通り動かせます

## セットアップ

```bash
npm install
npm run dev
```

`http://localhost:3000` を開いて確認してください。

## 環境変数

`.env.example` をコピーして利用します。

```bash
KEEPA_API_KEY=
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

本番環境の設定手順は [docs/production-setup-ja.md](/Users/M.Isozu/SourceCode/apde/docs/production-setup-ja.md) を参照してください。

## API

### `POST /api/discover`

カテゴリ探索を実行します。

```json
{
  "category": "デスク周り",
  "minPrice": 2000,
  "maxPrice": 7000,
  "maxReviews": 500,
  "limit": 20
}
```

### `POST /api/analyze`

ASIN単位の詳細分析を返します。

```json
{
  "asin": "B000000001",
  "title": "デスク向け ケーブル収納 プロダクト 01",
  "category": "デスク周り",
  "brand": "Nova A"
}
```

### `POST /api/refresh`

Cron想定の一括更新エンドポイントです。

```json
{
  "categories": ["デスク周り", "キッチン", "アウトドア"]
}
```

## ディレクトリ構成

```text
src/
  app/
    api/
      analyze/route.ts
      discover/route.ts
      refresh/route.ts
    globals.css
    layout.tsx
    page.tsx
  components/
    discovery-dashboard.tsx
  lib/
    cache.ts
    integrations.ts
    scoring.ts
    types.ts
db/
  schema.sql
```

## 本番接続に向けた次ステップ

1. `src/lib/integrations.ts` のモック生成部を Keepa / Gemini 実呼び出しに置き換える
2. Supabase Auth を追加して API へのアクセスを保護する
3. 探索履歴、比較リスト、チャットQ&AをDB保存する
4. Vercel Cron から `/api/refresh` を呼び出して人気カテゴリを再計算する
5. 利益計算、Alibaba / 1688比較、仕入れ候補生成へ拡張する
