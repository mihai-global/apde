# 本番環境セットアップ手順

> Vercel + Supabase + Keepa + Gemini で APDE をプロダクション運用するための env と外部設定をまとめます。
> 開発全般のガイドは [`developer-guide-ja.md`](developer-guide-ja.md) を参照。
> R6 (24/7 cron) のデプロイは [`r6-deploy-runbook-ja.md`](r6-deploy-runbook-ja.md) を参照。

## 前提

- デプロイ先: Vercel
- DB / Auth: Supabase
- 商品データ: Keepa API
- LLM: Gemini API (OpenAI / Anthropic に切替可能)
- Cron: GitHub Actions (Vercel Hobby の 1日1回上限を回避するため)

## 環境変数一覧

### 必須

| 変数 | 用途 | 公開 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | アプリ公開 URL (OAuth コールバックで使用) | 可 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | 可 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable / anon key | 可 |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバ側専用、リポジトリ層で使用 | **不可** |
| `KEEPA_API_KEY` | Keepa API キー | **不可** |
| `LLM_PROVIDER` | `gemini` / `openai` / `anthropic` / `mock` | 可 |
| `GEMINI_API_KEY` (or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) | LLM 認証 | **不可** |
| `CRON_SECRET` | `/api/cron/*` の `x-cron-secret` ヘッダ認証 | **不可** |

### オプション

| 変数 | 用途 |
|---|---|
| `KEEPA_DOMAIN` | 既定 `5` = Amazon.co.jp |
| `COST_BUDGET_JPY` | 月予算 (¥)、80% 超過で `cache_only_mode` 自動有効化 |
| `NOTIFY_WEBHOOK_URL` | Slack / Discord webhook URL (Cron 通知用) |
| `NEXT_PUBLIC_ENABLE_TWEAKS` | `1` で TweaksPanel (テーマ・密度) を有効化 (開発用) |

未設定の env は **mockMode** で動作し、起動エラーは出ません。

## Supabase セットアップ

1. Supabase Dashboard で新規プロジェクトを作成
2. `Settings → API Keys` から以下を取得:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - publishable key (or anon key) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - secret key (or service_role key) → `SUPABASE_SERVICE_ROLE_KEY`
3. `SQL Editor` で **順番に** 実行:
   ```
   db/schema.sql                              -- テーブル定義
   db/rls.sql                                 -- RLS ポリシー (single-user)
   db/seed.sql                                -- (任意) UI 確認用サンプル
   db/migrations/0002_keepa_normalize.sql     -- R1: keepa_snapshot + history (idempotent)
   db/migrations/0003_discovery_queue.sql     -- R6: Discovery キュー (idempotent)
   db/discovery_seed.sql                      -- (任意) 14 カテゴリ × 4 価格帯 seed
   ```
   > `schema.sql` には R1/R6 のテーブル定義も含まれているので、 fresh DB なら migrations は no-op。 既存環境を upgrade する時だけ migrations を流す。
4. `Authentication → Providers` で Email / Google / Apple を有効化
5. (推奨) `Authentication → URL Configuration` で `Site URL` と `Redirect URLs` に `${NEXT_PUBLIC_APP_URL}/api/auth/callback` を登録

## Vercel セットアップ

1. GitHub リポジトリを連携
2. `Settings → Environment Variables` に上記すべてを登録 (Production / Preview)
3. (任意) `Settings → Domains` でカスタムドメインを設定し、`NEXT_PUBLIC_APP_URL` を更新
4. `main` ブランチに push → Production デプロイ

> Vercel Cron は使わない。 Hobby プランの 1日1回上限では実用にならないので、 Cron は GitHub Actions に集約 (下記)。

## Cron セットアップ (GitHub Actions)

APDE は 2 種類の cron を提供する。 **R6 以降は `keepa-dispatch.yml` 1 本のみで運用する**のが推奨。

| Workflow | 役割 | 推奨頻度 | 状態 |
|---|---|---|---|
| `keepa-dispatch.yml` | Tier1/2 refresh + Discovery キュー消化 (superset) | 15 分おき | **主軸** |
| `keepa-refresh.yml` | Tier1/2 refresh のみ (R5 旧仕様) | 1 時間おき | 後方互換のため残置、 R6 移行後は disable 推奨 |

### Secrets 登録

リポジトリの `Settings → Secrets and variables → Actions` で:

| Name | Value |
|---|---|
| `APDE_BASE_URL` | 例 `https://apde.vercel.app` (末尾スラッシュなし) |
| `CRON_SECRET` | Vercel 側 `env.CRON_SECRET` と同じ値 |

### 初回起動 / R6 移行手順

詳細な移行ステップ (DB マイグレーション順、 検証コマンド、 ロールバック含む) は
**[`r6-deploy-runbook-ja.md`](r6-deploy-runbook-ja.md)** に集約してあるのでそちらを参照。

## Keepa セットアップ

1. Keepa.com で API 有効プランを契約
2. 管理画面から API キーを発行 → `KEEPA_API_KEY` に設定
3. `KEEPA_DOMAIN=5` (Amazon.co.jp) を確認

> Keepa はトークン制従量課金です。`COST_BUDGET_JPY` で月予算を制御できます。
> R6 cron はトークン残量を毎回読んでから `budget = min(left - 10, 50)` で動くので、 free-tier (refill ≈ 1 token/分) でも安全。

## Gemini セットアップ

1. Google AI Studio で API キーを発行 → `GEMINI_API_KEY` に設定
2. `LLM_PROVIDER=gemini` を設定
3. プロンプトテンプレ: `src/lib/llm/prompts.ts`
4. レポート再現性: `analysis.prompt_version` 列に保存 (現在 `report-v1.0`)

## 動作確認

```bash
# ローカル開発サーバ
pnpm dev

# Cron 動作確認 (R6: /api/cron/dispatch)
curl -X POST http://localhost:3000/api/cron/dispatch \
  -H "x-cron-secret: $CRON_SECRET" | jq

# 旧 Cron (Tier1/2 のみ) — 後方互換用
curl -X POST http://localhost:3000/api/cron/refresh \
  -H "x-cron-secret: $CRON_SECRET" | jq

# 月次コスト集計
curl http://localhost:3000/api/usage
```

> 注意: `/api/refresh` (Bearer 認証、 watchlist 単純再評価) は v1 の名残で残置されているが、 R6 以降は使わない。 新規セットアップは `/api/cron/dispatch` で統一すること。

## トラブルシューティング

トラブル時は [`developer-guide-ja.md` §13](developer-guide-ja.md#13-トラブルシューティング) を参照。
Cron 専用のトラブルシュートは [`r6-deploy-runbook-ja.md`](r6-deploy-runbook-ja.md#トラブルシューティング) に集約。
