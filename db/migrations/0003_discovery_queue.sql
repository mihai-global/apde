-- Migration 0003: discovery_queue (R6)
-- Cron dispatcher が `ingestDiscover` を循環実行するためのキュー。
-- 1 cron run につき 1 ジョブ pop → status='running' → 完了で done に flip。
-- done でも 24h 経過したら pickNext で再利用 (= 永久周回)。
-- 適用後は db/schema.sql 側にも追記する。idempotent。

begin;

create table if not exists discovery_queue (
  id            bigserial primary key,
  -- ingestDiscover の入力と一致させる
  category      text not null,                  -- ラベル (例: 'ホーム&キッチン')
  keyword       text,
  min_price     integer,                         -- JPY
  max_price     integer,
  min_reviews   integer,
  max_reviews   integer,
  per_page      integer not null default 50,
  enrich        boolean not null default false,
  -- 状態
  priority      smallint not null default 50,    -- 大きいほど優先
  status        text not null default 'pending'
                  check (status in ('pending','running','done','failed')),
  attempts      smallint not null default 0,
  last_error    text,
  last_run_at   timestamptz,
  ingested_count integer,                        -- 直近実行で取れた ASIN 数
  -- メタ
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- pickNext 用: pending を最優先、なければ古い done を循環
create index if not exists idx_discovery_queue_next
  on discovery_queue (status, priority desc, last_run_at nulls first);

create index if not exists idx_discovery_queue_status
  on discovery_queue (status);

-- updated_at 自動更新 (schema.sql 既存の set_updated_at() を再利用)
drop trigger if exists discovery_queue_updated_at on discovery_queue;
create trigger discovery_queue_updated_at before update on discovery_queue
  for each row execute function set_updated_at();

commit;
