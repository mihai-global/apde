# 本番環境セットアップ手順

> Vercel + Supabase + Keepa + Gemini で APDE をプロダクション運用するための env と外部設定をまとめます。
> 開発全般のガイドは [`developer-guide-ja.md`](developer-guide-ja.md) を参照。

## 前提

- デプロイ先: Vercel
- DB / Auth: Supabase
- 商品データ: Keepa API
- LLM: Gemini API (OpenAI / Anthropic に切替可能)

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
| `CRON_SECRET` | `/api/refresh` の Bearer 認証 | **不可** |

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
3. `SQL Editor` で順に実行:
   ```
   db/schema.sql      -- テーブル定義
   db/rls.sql         -- RLS ポリシー (single-user)
   db/seed.sql        -- (任意) 初期データ
   ```
4. `Authentication → Providers` で Email / Google / Apple を有効化
5. (推奨) `Authentication → URL Configuration` で `Site URL` と `Redirect URLs` に `${NEXT_PUBLIC_APP_URL}/api/auth/callback` を登録

## Vercel セットアップ

1. GitHub リポジトリを連携
2. `Settings → Environment Variables` に上記すべてを登録 (Production / Preview)
3. デプロイ後、`Settings → Cron Jobs` で `/api/refresh` をスケジュール:
   ```
   Path: /api/refresh
   Method: POST
   Schedule: 0 17 * * * (UTC = 02:00 JST 日次)
   Headers: Authorization: Bearer ${CRON_SECRET}
   ```
4. (任意) `Settings → Domains` でカスタムドメインを設定し、`NEXT_PUBLIC_APP_URL` を更新

## Keepa セットアップ

1. Keepa.com で API 有効プランを契約
2. 管理画面から API キーを発行 → `KEEPA_API_KEY` に設定
3. `KEEPA_DOMAIN=5` (Amazon.co.jp) を確認

> Keepa はトークン制従量課金です。`COST_BUDGET_JPY` で月予算を制御できます。

## Gemini セットアップ

1. Google AI Studio で API キーを発行 → `GEMINI_API_KEY` に設定
2. `LLM_PROVIDER=gemini` を設定
3. プロンプトテンプレ: `src/lib/llm/prompts.ts`
4. レポート再現性: `analysis.prompt_version` 列に保存 (現在 `report-v1.0`)

## SST フォント (任意)

Sony 社内利用者は `public/fonts/` に `SST JP Pro` / `SST` の OTF/WOFF を配置すると自動適用されます。`.gitignore` で誤コミットを抑止しているため、リポジトリには含まれません。

## 動作確認

```bash
# 探索 → 候補一覧 → 詳細
pnpm dev

# Cron 動作確認
curl -H "Authorization: Bearer $CRON_SECRET" -X POST http://localhost:3000/api/refresh

# 月次コスト集計
curl http://localhost:3000/api/usage
```

## トラブルシューティング

トラブル時は [`developer-guide-ja.md` §13](developer-guide-ja.md#13-トラブルシューティング) を参照。
