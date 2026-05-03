# 本番環境セットアップ手順

このドキュメントは、Amazon Product Discovery Engine をプロダクションで動かすための環境変数設定と外部サービス設定手順をまとめたものです。

## 前提

- デプロイ先は Vercel
- DB / Auth は Supabase を想定
- LLM は Gemini API を想定
- 商品データは Keepa API を想定

## 現在のコードで実際に使っている環境変数

現時点のコードで参照しているのは主に以下です。

```env
KEEPA_API_KEY=...
GEMINI_API_KEY=...
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

以下は `.env.example` にありますが、現時点ではまだ実装上は未使用です。

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
```

## 環境変数一覧

### 必須

#### `KEEPA_API_KEY`

- 用途: Keepa API 接続
- 配置先: サーバー側のみ
- 公開可否: 不可

#### `GEMINI_API_KEY`

- 用途: Gemini API 接続
- 配置先: サーバー側のみ
- 公開可否: 不可

#### `NEXT_PUBLIC_APP_URL`

- 用途: アプリの公開URL
- 例: `https://apde.example.com`
- 公開可否: 可

### 将来利用予定

#### `SUPABASE_URL`

- 用途: Supabase プロジェクトURL
- 備考: 本番接続時は `NEXT_PUBLIC_SUPABASE_URL` に寄せる方が自然です

#### `SUPABASE_ANON_KEY`

- 用途: クライアントから使う公開キー
- 備考: 現行の Supabase では `publishable key` の利用が推奨です

#### `SUPABASE_SERVICE_ROLE_KEY`

- 用途: サーバー専用の高権限キー
- 公開可否: 不可

#### `CRON_SECRET`

- 用途: `/api/refresh` を Cron から安全に呼ぶための共有シークレット
- 注意: 現時点では、この値を使った認証処理はまだ未実装です

## Vercel での設定手順

1. Vercel の対象プロジェクトを開く
2. `Settings`
3. `Environment Variables`
4. 各環境変数を追加する
5. `Production` に適用する
6. 保存後、再デプロイする

少なくとも以下を `Production` に入れてください。

```env
KEEPA_API_KEY=...
GEMINI_API_KEY=...
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

必要に応じて `Preview` にも同じ値、または検証用の別値を設定します。

## ローカル開発での設定

プロジェクト直下に `.env.local` を作成して設定します。

```env
KEEPA_API_KEY=...
GEMINI_API_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 各サービスでの取得方法

### 1. Gemini API キー

取得元:

- Google AI Studio

手順:

1. Google AI Studio を開く
2. API キー管理画面へ進む
3. 新しい API キーを作成する
4. `GEMINI_API_KEY` として Vercel に登録する

補足:

- Gemini API は `GEMINI_API_KEY` もしくは `GOOGLE_API_KEY` を環境変数として利用できます
- このリポジトリでは `GEMINI_API_KEY` を使っています

### 2. Keepa API キー

取得元:

- Keepa の契約アカウント管理画面

手順:

1. Keepa で API 利用可能なプランを契約する
2. 管理画面から API キーを取得する
3. `KEEPA_API_KEY` として Vercel に登録する

補足:

- Keepa は契約前提のため、無料APIではありません
- 本番前にトークン消費量と月額コストを確認してください

### 3. Supabase キー

取得元:

- Supabase Dashboard
- `Settings > API Keys`

推奨運用:

- ブラウザ公開用: `publishable key`
- サーバー専用: `secret key`

補足:

- 旧来の `anon` / `service_role` は legacy 扱いです
- 新規構成では `sb_publishable_...` と `sb_secret_...` の利用が推奨です

## セキュリティ注意点

### 公開してよいもの

- `NEXT_PUBLIC_APP_URL`
- 将来的な `NEXT_PUBLIC_SUPABASE_URL`
- 将来的な `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### 公開してはいけないもの

- `KEEPA_API_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- 将来的な `SUPABASE_SECRET_KEY`
- `CRON_SECRET`

## 現時点の制約

このリポジトリは、まだ以下が未実装です。

- Keepa 実API呼び出し
- Gemini 実API呼び出し
- Supabase 実接続
- Supabase Auth
- `/api/refresh` の `CRON_SECRET` 検証

つまり、環境変数を入れるだけでは完全本番運用にはなりません。今は `mock / hybrid` を返すMVP段階です。

## 本番化する際の推奨順序

1. Keepa 実接続を入れる
2. Gemini 実接続を入れる
3. Supabase クライアントを追加する
4. Supabase Auth で API 保護を入れる
5. `/api/refresh` に `CRON_SECRET` 検証を実装する
6. Vercel Cron から定期更新する

## 参考リンク

- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Vercel Managing Environment Variables](https://vercel.com/docs/environment-variables/managing-environment-variables)
- [Supabase API Keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Gemini API Keys](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini API Reference](https://ai.google.dev/api)
