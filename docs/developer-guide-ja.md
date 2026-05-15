# APDE 開発者向けスタートアップガイド

> このドキュメント1本で、初めてリポジトリに入る開発者がアーキテクチャ → 起動 → 拡張までを把握できることを目標にしています。

---

## 1. このドキュメントの位置付け

- 対象: APDE のフロントエンド・バックエンドを触る開発者
- 範囲: ローカル起動からデプロイ・拡張ガイドまで
- 関連: [`requirements_v1_1_ja.md`](requirements_v1_1_ja.md) が機能要件、`production-setup-ja.md` が本番環境設定

---

## 2. 0からの起動 (5分コース)

```bash
pnpm install
cp .env.example .env.local        # 中身は空のままで OK
pnpm dev                           # http://localhost:3000
```

env を一切触らなくても **mockMode** が自動で有効化され、以下のように動作します:

- Supabase 接続なし → in-memory ストア (リロードで初期化)
- Keepa 未接続 → seeded random でモック時系列を生成
- LLM 未接続 → 構造ルールベースのフォールバック洞察 (`createFallbackInsight`)

`http://localhost:3000` を開くと `/login` にリダイレクトされ、任意のメール+パスワードで「サインイン」を押すとダッシュボードに進めます (mockMode 時は本物の認証は走りません)。

---

## 3. アーキテクチャ概要

```
┌──────────────────────────────────────────┐
│ Browser                                  │
└──────────────┬───────────────────────────┘
               │ HTML / JS
┌──────────────▼───────────────────────────┐
│ Next.js (App Router)                     │ ←── Vercel
│  ├─ (auth)/login           Login UI      │
│  ├─ (app)/                 認証ガード ↓ │
│  │   ├─ page.tsx           Dashboard    │
│  │   ├─ search/            探索 + 一覧  │
│  │   ├─ products/[asin]    詳細 8 sec   │
│  │   ├─ watchlist          監視リスト    │
│  │   └─ dictionary         学習辞書     │
│  ├─ api/                   REST + Cron  │
│  └─ middleware.ts          Auth Gate    │
└──────────────┬───────────────────────────┘
               │
       ┌───────┴────────────────────┐
       ▼                            ▼
┌──────────────┐    ┌──────────────────────┐
│  src/lib     │    │ Supabase             │
│  domain      │    │  PostgreSQL + Auth   │
└──┬───────────┘    └──────────────────────┘
   │
   ├── scoring.ts  / gates.ts  / profit.ts
   ├── keepa/      / llm/      / keywords/
   ├── exclusion/  / usage/    / supabase/
   └── env.ts                       (mockMode 判定)
```

**5層構造**:

| 層 | 役割 | 主なファイル |
|---|---|---|
| UI (Server Components) | データ整形・レンダリング | `src/app/(app)/**/page.tsx` |
| UI (Client Components) | 対話・状態 | `src/components/**/*.tsx` |
| API Routes / Server Actions | 外部 IF | `src/app/api/**/route.ts`, `src/app/(app)/**/actions.ts` |
| Domain (lib) | スコア・ゲート・利益・LLM 等 | `src/lib/**/*.ts` |
| Persistence | Supabase + in-memory mock | `src/lib/supabase/**` |

---

## 4. ディレクトリツアー

```
src/
├─ app/
│  ├─ (auth)/login/page.tsx       … ログイン画面
│  ├─ (app)/                       … 認証必須エリア
│  │  ├─ layout.tsx               … AppHeader をマウント
│  │  ├─ page.tsx                 … ダッシュボード
│  │  ├─ search/                  … 探索フォーム + 候補一覧
│  │  ├─ products/[asin]/         … 商品詳細 8 セクション
│  │  ├─ watchlist/               … 監視リスト
│  │  └─ dictionary/              … 学習辞書
│  ├─ api/
│  │  ├─ auth/callback/route.ts   … Supabase OAuth コールバック
│  │  ├─ discover/route.ts        … 探索 REST
│  │  ├─ analyze/route.ts         … 詳細分析 REST
│  │  ├─ refresh/route.ts         … Cron (CRON_SECRET 必須)
│  │  └─ usage/route.ts           … API コスト集計
│  ├─ globals.css                 … Editorial Light Design System
│  └─ layout.tsx                  … data-theme/density/accent
├─ components/
│  ├─ primitives/                 … Icon / DBadge / ScoreBar / Chip / Seg / Toggle 等
│  ├─ shell/                      … AppHeader / Crumbs
│  ├─ dashboard/                  … KpiRow / BudgetCard / WatchlistList / RecentRunsTable
│  ├─ search/                     … SearchForm
│  ├─ list/                       … CandidateListView
│  ├─ detail/                     … 8 セクション + サイドバー
│  ├─ watchlist/                  … 監視リスト管理
│  ├─ dictionary/                 … 辞書 CRUD
│  └─ auth/                       … LoginForm
├─ lib/
│  ├─ env.ts                      … env 正規化 + mockMode 判定
│  ├─ types.ts                    … v1.1 §8 準拠の型
│  ├─ scoring.ts                  … 5軸スコア + ルールチェック
│  ├─ gates.ts                    … 8 強制ゲート評価
│  ├─ profit.ts                   … 利益性計算
│  ├─ format.ts                   … yen / fmtNum / formatDecision
│  ├─ integrations.ts             … 探索 / 分析 / 再評価のオーケストレーション
│  ├─ keywords/generate.ts        … 5軸キーワード生成
│  ├─ exclusion/filter.ts         … 探索段階の自動除外
│  ├─ keepa/{client,derive,mock}.ts
│  ├─ llm/{index,gemini,prompts,mock}.ts
│  ├─ supabase/{server,browser,mock-store,repositories}.ts
│  └─ usage/tracker.ts            … API コスト記録
├─ middleware.ts                  … Supabase Auth ガード
db/
├─ schema.sql                     … 10 テーブル定義
├─ rls.sql                        … RLS ポリシー (single-user)
└─ seed.sql                       … 12 商品 + 6 除外 + 辞書サンプル
demo/
└─ index.html                     … スタンドアロン UI ショーケース
docs/
├─ developer-guide-ja.md          … (このファイル)
├─ production-setup-ja.md
└─ requirements_v1_1_ja.md
```

---

## 5. デザインシステム

すべて `src/app/globals.css` の CSS 変数で定義されています。

- **テーマ**: `<body data-theme="light"|"dark">`
- **密度**: `<body data-density="compact"|"normal"|"roomy">`
- **アクセント**: `<body data-accent="mono"|"blue">`

クラス命名:

| 用途 | クラス |
|---|---|
| ヘッダー | `.app-header / .brand / nav` |
| 判定バッジ | `.dbadge.style-{pill,tag,dot,square}.tone-{go,cond,no}` |
| ゲートビュー | `.gate-list / .gate-flow / .gate-matrix` |
| Keepa チャート | `.kchart` |
| 利益性 | `.prof / .param-grid` |
| ダッシュボード | `.kpi-row / .kpi / .budget-card / .wlist / .wrow` |
| 探索一覧 | `.tbl / .cgrid / .pcard / .exc-pane` |

ユーティリティ: `.eyebrow / .h1 / .h2 / .h3 / .num / .mono / .rowsplit / .cluster / .sectiongap`

### フォント

`--font-sans` は `var(--font-noto-jp), var(--font-inter), system fonts` の順序で定義されています。

---

## 6. データフロー

### 6.1 探索フロー

```
カテゴリ入力 (SearchForm)
  → runDiscover() Server Action
  → discoverProducts(input, { dictionary })   ← lib/integrations
  → generateKeywords()                         ← 5軸テンプレ
  → createMockMetrics() / fetchKeepaSeries()  ← lib/keepa
  → evaluateExclusion()                        ← 学習辞書 + ハードルール
  → analyzeMetrics() = scoreAsin + computeProfit + evaluateGates + decisionFromScore + downgradeByGates + generateInsight
  → insertDiscoveryRun()                       ← discovery_runs に保存
  → redirect(/search/[runId])
```

### 6.2 詳細分析フロー

```
/products/[asin] (Server Component)
  → analyzeProduct({asin})
  → scoring + gates + profit + LLM
  → page では analysis を直接レンダリング (DB保存は別タスク)
  → askLlm() Server Action から analysis_threads にスレッド追加
  → addToWatchlist() Server Action から watchlist 更新
```

### 6.3 再評価フロー (Cron 想定)

```
POST /api/refresh
  Authorization: Bearer ${CRON_SECRET}
  → listWatchlist()
  → 各 ASIN を analyzeProduct → 新スコア生成
  → (将来) analysis に新エントリで保存 + 差分通知
```

---

## 7. API リファレンス

### `POST /api/discover`
```json
{ "category": "デスク周り", "minPrice": 3000, "maxPrice": 8000, "maxReviews": 500, "limit": 50 }
```
→ `DiscoveryResponse` (runId / candidates / excluded / keywords / source / durationMs)

### `POST /api/analyze`
```json
{ "asin": "B0CXM7K2PQ", "category": "デスク周り" }
```
→ `AnalysisResult` (score / decision / breakdown / gates / metrics / derived / profit / insight)

### `POST /api/refresh` (Cron)
```bash
curl -H "Authorization: Bearer $CRON_SECRET" -X POST $APP_URL/api/refresh
```
→ `RefreshReport`

### `GET /api/usage`
→ `{ total, budget, perProvider, callsLast24h }`

UI 内部の CRUD は Server Actions (`(app)/.../actions.ts`) を使用。REST API として外部に公開する場合は `/api/watchlist` `/api/dictionary` を `repositories.ts` から薄くラップして追加します。

---

## 8. DB スキーマと RLS

`db/schema.sql` で以下 10 テーブルを定義:

1. `products` — ASIN マスタ (重量・サイズ・ブランド集中度)
2. `keepa_data` — 価格・BSR・出品者・Buy Box の時系列 + 派生指標 (CV など)
3. `analysis` — スコア + ゲート + 利益性 + LLM レポート (履歴保持・上書き禁止)
4. `discovery_runs` — 探索ラン (キーワード / 候補 / 除外)
5. `watchlist` — 監視中 ASIN (status: candidate / sourcing / live)
6. `dictionary` — 学習辞書 (4 種別)
7. `purchase_feedback` — 仕入後の結果 (Phase 4 で集計利用)
8. `api_usage` — API コスト履歴
9. `app_settings` — KV 設定 (cache_only_mode / cost_budget_jpy など)
10. `analysis_threads` — ASIN 別 LLM Q&A

`db/rls.sql` は single-user 前提のため `auth.uid() IS NOT NULL` で全テーブルに full access ポリシーを当てます。

リポジトリ層 (`src/lib/supabase/repositories.ts`) は `mockMode.supabase` を判定して in-memory ストアと Supabase 実接続を切り替えます。

---

## 9. 外部 API 統合

### Keepa
- 必要 env: `KEEPA_API_KEY` / `KEEPA_DOMAIN` (既定 5 = Amazon.co.jp)
- 実装: `src/lib/keepa/client.ts` (指数バックオフ最大 3 回 + 失敗時はモックフォールバック)
- 派生指標 (CV / セール頻度 / Buy Box 集中度 / 90 日下落率) は `src/lib/keepa/derive.ts`

### Gemini (LLM)
- 必要 env: `LLM_PROVIDER=gemini` + `GEMINI_API_KEY`
- 実装: `src/lib/llm/gemini.ts` (`@google/generative-ai`)
- プロンプトは `src/lib/llm/prompts.ts` で `prompt_version` 付きテンプレ
- OpenAI / Anthropic は `src/lib/llm/index.ts` で同じ `InsightRequest → StrategicInsight` 契約に従って実装可能 (将来拡張)

### Amazon SP-API (Phase 3 予定)
- Product Fees / Catalog Items / Pricing
- 現状は未実装 (`src/lib/spapi/` は空のスタブを推奨)
- 利益計算は SP-API 接続前の概算で `src/lib/profit.ts` の `estimateFbaFee` が代替

---

## 10. mockMode と本番モード

| 構成 | mockMode | 影響 |
|---|---|---|
| Supabase 認証情報なし | supabase: true | リポジトリが in-memory ストアを使用、認証ガード無効化 |
| `KEEPA_API_KEY` なし | keepa: true | `discoverProducts` `analyzeProduct` でモック時系列を生成 |
| LLM env なし or `LLM_PROVIDER=mock` | llm: true | フォールバック洞察 (構造ルールベース) を返す |

3 種の mockMode は独立しています。例えば「Supabase だけ実接続、Keepa/LLM は mock」も可能です。

UI 上は `source: "live" | "hybrid" | "mock"` がレスポンスに付き、ユーザーに「一部取得失敗」「mock データ」を示せます。

---

## 11. テスト・ローカル検証

```bash
pnpm typecheck          # 0 errors を維持
pnpm build              # Next.js ビルド成功確認
pnpm dev                # 開発サーバ
```

### シナリオ手動確認 (mockMode)

1. `/login` で「サインイン」(任意のメール) → ダッシュボード遷移
2. ダッシュボードに KPI / 監視リスト / 当月コスト / 最近の探索ラン3件が表示される
3. 「新しい探索を開始」→ カテゴリ「デスク周り / ガジェット」→ 「探索を実行」
4. 候補一覧でテーブル / カード切替・判定フィルタ・ソート・除外ペイン
5. 商品クリック → 詳細 8 セクション + サイドバー全表示。3 ゲートビュー切替
6. 利益性スライダー (原価率 / CVR / CPC) で粗利率がリアルタイム再計算
7. LLM 5 タブ切替・Q&A 入力で mock 応答が増える
8. サイドバーから「監視リストへ追加」→ `/watchlist` で確認
9. `/dictionary` で除外ブランド追加 → 次回探索で対象が除外候補に出る

### Playwright (任意)

主要画面のスナップショットをダーク / ライトで撮影:

```bash
# 例: chrome 経由で /login, /, /search, /products/B0CXM7K2PQ を撮影
```

---

## 12. デプロイ (Vercel)

1. Vercel に GitHub リポジトリを連携
2. `Settings → Environment Variables` に以下を登録 (Production / Preview):

```
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
KEEPA_API_KEY=...
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
CRON_SECRET=...
COST_BUDGET_JPY=10000
NOTIFY_WEBHOOK_URL=
```

3. Supabase に新規プロジェクトを作成 → SQL Editor で `db/schema.sql` → `db/rls.sql` → (任意) `db/seed.sql` を順に実行
4. Vercel Cron Job を `Project → Cron Jobs` から追加: `0 17 * * *` (UTC) で `/api/refresh` を `Authorization: Bearer $CRON_SECRET` 付きで叩く
5. `main` ブランチに push → Production デプロイ

---

## 13. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `/` 開いた瞬間に `/login` に飛ばされる | 本番モードで Supabase 未認証 | `.env.local` を空にして mockMode で起動するか、Supabase でユーザー作成 |
| `/api/refresh` が 503 | `CRON_SECRET` 未設定 | `.env.local` で値をセット |
| Keepa が 429 を返す | レート制限 | `fetchWithRetry` が 3 回まで指数バックオフ。`KEEPA_DOMAIN` が正しいかも確認 |
| Gemini が JSON parse 失敗 | `responseMimeType: application/json` 効かず | `gemini-2.5-pro` 以外を使う場合は `prompts.ts` を調整 / フォールバックされる |
| 探索結果に同じカテゴリの除外候補が出ない | `applyDictionary=false` になっている | `SearchForm` のトグル ON / 辞書ページにエントリ追加 |
| 詳細画面で履歴が出ない | 初回は履歴 0 件が正常 | `analyzeProduct` 完了後 `analysis` テーブルに INSERT する処理を追加すれば履歴が増える |

---

## 14. 拡張ガイド

### Phase 3 (要件 v1.1 §10)

- SP-API: `src/lib/spapi/` ディレクトリを作成し `lib/profit.ts` の `estimateFbaFee` を置換
- Vercel Cron Job 設定: `vercel.json` を追加するか、Vercel ダッシュボードで設定
- 通知: `NOTIFY_WEBHOOK_URL` 経由で Slack / Discord に POST

### Phase 4 (学習ループ)

- `purchase_feedback` を編集する UI を `/watchlist/[asin]/feedback` に追加
- 過去 GO 判定の事後妥当性は `analysis` × `purchase_feedback` の集計で算出

### Phase 5 (アンチゴール再確認後)

- Alibaba / 1688 連携、工場見積もり連携、Google Trends — 拡張前に要件を再評価する

---

## 15. リファレンス

- 要件定義: [`requirements_v1_1_ja.md`](requirements_v1_1_ja.md)
- 本番セットアップ: [`production-setup-ja.md`](production-setup-ja.md)
- Next.js App Router: https://nextjs.org/docs/app
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side/nextjs
- Keepa API: https://keepa.com/#!discuss/t/product-object/116
- Gemini API: https://ai.google.dev/gemini-api/docs
