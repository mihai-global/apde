# APDE — Amazon Product Discovery Engine

> 「迷わず捨て、迷わず GO する」個人物販リサーチの構造化ツール
>
> Amazon FBA / OEM の候補商品を、5軸スコアリング + 強制ゲート判定で構造的に評価し、
> GO / 条件付き GO / NO-GO の意思決定まで一気通貫で支援します。

## 概要

- 5ページ構成: ダッシュボード / 探索 / 候補一覧 / 商品詳細 / 監視リスト / 学習辞書
- 商品詳細は8セクション (結論 / スコア / ゲート / Keepa / 利益性 / LLM / 履歴 / メモ)
- ライト・ダーク両モード、密度3段階、判定バッジ4スタイル切替対応
- Editorial Light Design System (ミニマル黒白ベース)
- Supabase Auth + PostgreSQL / Keepa API / Gemini API 連携
- 外部API無しでも動く mockMode (env未設定時に自動切替)

## クイックスタート

```bash
pnpm install
cp .env.example .env.local        # env は空でもOK (mockMode で起動)
pnpm dev                           # http://localhost:3000
```

詳細は [`docs/developer-guide-ja.md`](docs/developer-guide-ja.md) を参照。

## 関連ドキュメント

- [開発者向けスタートアップガイド](docs/developer-guide-ja.md) — セットアップ / アーキテクチャ / API / DB / デプロイまで
- [本番環境セットアップ手順](docs/production-setup-ja.md) — Vercel + Supabase + Keepa + Gemini 全体構成
- [R6 デプロイ手順書](docs/r6-deploy-runbook-ja.md) — 24/7 Cron + Discovery キュー有効化の番号付き手順
- [要件定義書 v1.1](docs/requirements_v1_1_ja.md) — 機能要件・データモデル・KPI

## デモ

`demo/index.html` は外部 API 無しで動作する **UI 完成版のスタンドアロン HTML** です。
ブラウザで開くだけで全画面のデザインを確認できます (実データは扱いません)。

