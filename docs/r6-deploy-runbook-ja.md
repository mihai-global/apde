# R6 デプロイ手順書 — 24/7 Keepa トークン回収 & Discovery 自動化

> このドキュメント 1 枚で R6 (`/api/cron/dispatch` + `discovery_queue` + 画像 polish) を本番に上げ切れることを目標にする。 順番が大事なので、 上から順に実行すること。
>
> 関連: [本番環境セットアップ](production-setup-ja.md) (初回構築) / [開発者ガイド](developer-guide-ja.md) (全体像)

## 何が変わるか

| | 旧 (R5) | 新 (R6) |
|---|---|---|
| Cron スケジューラ | GitHub Actions: `keepa-refresh.yml` (1h おき) | GitHub Actions: `keepa-dispatch.yml` (15min おき) |
| エンドポイント | `/api/cron/refresh` (Tier1/2 ingestDiff のみ) | `/api/cron/dispatch` (Tier1/2 + Discovery キュー消化) |
| 新規 ASIN 発掘 | 手動 `/search` 起点 | `discovery_queue` テーブルから cron が自動 pop |
| 一覧サムネ | 48px、 ローカル fallback のみ | 72px、 Amazon CDN サイズヒント、 ASIN ハッシュ色 placeholder |

トークンが回復するたびに `/api/cron/dispatch` が消化するので、 Keepa の `refillRate` (free-tier ≈ 1 token/分) を 24h ほぼ使い切れる。

## 事前チェック (5 秒で確認)

```bash
# リポジトリの最新を取得済みであること
git pull origin main
git log -1 --oneline
# → 53df93d 以降のコミットが見えていれば OK
```

Vercel / Supabase / GitHub の認証情報が手元にあること:
- [ ] Supabase ダッシュボードに入れる
- [ ] Vercel ダッシュボードに入れる
- [ ] GitHub リポジトリの Settings にアクセスできる

## 手順

### 1. Supabase: DB マイグレーションを適用

Supabase ダッシュボード → `SQL Editor` で次のファイルの中身を **コピペして順に実行**:

| 順 | ファイル | 内容 |
|---|---|---|
| 1 | `db/migrations/0003_discovery_queue.sql` | `discovery_queue` テーブル + index + trigger |

> 0002 が未適用の環境 (R5 を飛ばしてしまった場合) は `db/migrations/0002_keepa_normalize.sql` を先に流すこと。 すべての migration は idempotent なので、 適用済みでも再実行で壊れない。

**検証**:
```sql
SELECT to_regclass('public.discovery_queue');
-- → discovery_queue が返れば成功。 NULL ならテーブル未作成
```

### 2. Supabase: シードを投入

**選択肢 A (推奨): UI 経由**
1. アプリにログイン (`/login`)
2. `/diagnostics` を開く
3. 「Discovery キュー」セクション → **シードを投入** ボタンをクリック
4. 確認ダイアログで OK → "シード投入: 56 件追加" と出れば成功

**選択肢 B: SQL 直叩き**
```bash
psql "$SUPABASE_DB_URL" -f db/discovery_seed.sql
```
または Supabase SQL Editor に `db/discovery_seed.sql` をコピペ。

**検証**:
```sql
SELECT status, COUNT(*) FROM discovery_queue GROUP BY status;
-- → pending | 56 (初回) または ≤56 (既存と重複した分はスキップされる)
```

### 3. Vercel: 環境変数を確認 (新規追加なし)

R6 は新しい env を必要としない。 既存の以下が設定済みであることを確認:

```
CRON_SECRET            # 必須
KEEPA_API_KEY          # 必須
KEEPA_DOMAIN=5         # Amazon.co.jp
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
LLM_PROVIDER + 対応 API キー
```

> ⚠ `CRON_SECRET` の値は **後で GitHub Secrets にも同じ値を入れる**ので、 ここでメモ帳に控えておく。

### 4. Vercel: コードをデプロイ

```bash
git push origin main
```

main へ push すれば Vercel が自動で Production デプロイする。 ダッシュボードでビルド成功 (緑のチェック) を確認。

**検証** (デプロイ後 30 秒以内):
```bash
# Production URL に置き換えること
BASE_URL="https://apde.vercel.app"
SECRET="<上で控えた CRON_SECRET>"

# 認証なし → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE_URL/api/cron/dispatch"
# → 401

# 認証あり → 200 + JSON
curl -fsS -X POST "$BASE_URL/api/cron/dispatch" \
  -H "x-cron-secret: $SECRET" | jq
# → {"startedAt":..., "refresh":{...}, "discovery":{...}, "tokensBefore":N, "tokensAfter":M}
```

`tokensBefore` がプラス値で `discovery.ingested` が 1 以上なら、 1 回目の Discovery が回ったことになる。

### 5. GitHub: Secrets を確認

リポジトリの `Settings → Secrets and variables → Actions` で以下 2 つが登録済みであること:

| Name | Value |
|---|---|
| `APDE_BASE_URL` | `https://apde.vercel.app` (本番 URL、 末尾スラッシュなし) |
| `CRON_SECRET` | 手順 3 でメモした値と同じ |

> R5 で `keepa-refresh.yml` を使っていたなら両方とも既に設定済みのはず。 値が一致しているかだけ再確認すれば OK。

### 6. GitHub: 新 workflow を手動実行して確認

1. `Actions` タブ → 左メニュー `Keepa Dispatch (R6)`
2. 右上 **Run workflow** → `Run workflow` ボタン
3. 30 秒〜 1 分後に run が完了
4. run を開き、 `Summary` 欄に次のような表示があれば成功:
   ```
   ## Keepa dispatch result
   - tier1 processed: 0
   - tier2 processed: 0
   - discovery: job=1 category=ホーム&キッチン ingested=18 skipped=2
   - tokens: 250 → 235 (budget=50)
   - duration: 12340ms
   ```

### 7. GitHub: 旧 workflow を無効化 (推奨)

`keepa-dispatch.yml` は `keepa-refresh.yml` の superset なので両方を回す必要はない。 二重実行による `/token` 連打を避けるため、 旧 workflow を **disable** する:

1. `Actions` タブ → 左メニュー `Keepa Refresh`
2. 右上 `⋯` → **Disable workflow**

> 無効化が不安なら、 そのまま並走させても精度的には安全 (precheck で二重消費は防がれる)。 ただし GitHub Actions の minutes 消費は増える。

### 8. 動作確認 (24h 観察)

最初の 1 日は次の点をチェック:

| 場所 | 確認内容 |
|---|---|
| `Actions` → `Keepa Dispatch (R6)` | 15-30 分ごとに run が走り、 大半が 200 で終わっている |
| `/diagnostics` → Discovery キュー | `pending` が減り `done` が増える。 24h 後には 56 件すべて `done` 付近 |
| `/diagnostics` → Keepa トークン状態 | `残トークン` が 0 付近で推移 (= フル消化できている) |
| `/diagnostics` → ストレージ | `market_analysis` の行数が増加 |
| `/search` | 一覧サムネが 72px で表示され、 画像がない ASIN は ASIN 先頭 2 文字 + 背景色のプレースホルダー |

24h で `done=56` 付近、 かつ `market_analysis` が 300-1000 件くらい増えていれば設計通り。

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| GH Actions の run が 401 | `CRON_SECRET` 不一致 | GH Secrets と Vercel env の値が同一か確認。コピペ時の空白に注意 |
| `discovery.refused` が毎回出る | tokensLeft が常に -10 未満 | Keepa が rate-limited 状態。 `refillRate` の回復を待つ (UI で確認可) |
| `Keepa Dispatch (R6)` が 1 回も走らない | GH Actions の Cron は repo が 60 日 push なしになると停止する | 何か小さな commit を push して再開させる |
| キューが pending のまま消化されない | budget が常に discovery 閾値 (8) 未満 | Tier1/2 が多すぎて budget を吸っている。 `/diagnostics` で Refresh queue を確認 |
| 一覧サムネが小さいまま | ブラウザキャッシュ | Hard reload (Cmd+Shift+R) |
| 旧 cron `/api/refresh` (Bearer 認証) が動かなくなった | R6 の変更には含まれず、別系統 | R6 では使わない。 必要なら `/api/cron/refresh` または `/api/cron/dispatch` に切り替え |

## ロールバック

R6 を引き戻したい場合 (緊急時):

1. `Actions → Keepa Dispatch (R6) → ⋯ → Disable workflow`
2. `Actions → Keepa Refresh → ⋯ → Enable workflow` (旧 1h 周回に戻す)
3. コードは戻さなくて良い (`/api/cron/dispatch` は呼ばれなければ無害)
4. `discovery_queue` テーブルも放置で良い (使わなければストレージ数 KB のみ)

完全削除したいときだけ:
```sql
DROP TABLE IF EXISTS discovery_queue CASCADE;
```
