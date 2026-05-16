-- APDE Supabase スキーマ (要件 v1.1 §8 準拠)
-- 適用順: schema.sql → rls.sql → seed.sql

create extension if not exists "pgcrypto";

-- 1) products: ASIN マスタ
create table if not exists products (
  asin                  text primary key,
  title                 text not null,
  category              text not null,
  brand                 text,
  image_url             text,
  current_price         numeric(10,2),
  weight_grams          integer,
  size_tier             text check (size_tier in ('SMALL_STANDARD','LARGE_STANDARD','OVERSIZE')),
  review_count          integer not null default 0,
  seller_count          integer not null default 0,
  brand_strength        numeric(5,2),                -- 0-100, 上位3ブランド集中度
  rating                numeric(3,2),
  is_hazmat             boolean not null default false,
  is_regulated          boolean not null default false,
  -- Phase 1 (R1) で追加: refresh 管理 + Tier
  keepa_last_full_at    timestamptz,                 -- /product?history=1 の最終取得 (90d cycle)
  keepa_last_diff_at    timestamptz,                 -- /product?history=0 の最終取得 (24h/7d cycle)
  tier                  smallint not null default 3 check (tier in (1,2,3)),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_products_category on products (category);
create index if not exists idx_products_updated_at on products (updated_at desc);
create index if not exists idx_products_tier on products (tier);
create index if not exists idx_products_last_diff on products (keepa_last_diff_at);

-- 2) price_history: 価格時系列 (Amazon/New/Used/BuyBox を 1 テーブル)
create table if not exists price_history (
  asin        text not null references products(asin) on delete cascade,
  price_type  text not null check (price_type in ('amazon','new','used','buybox')),
  ts          timestamptz not null,
  price_yen   integer,                            -- NULL = 在庫なし
  primary key (asin, price_type, ts)
);
create index if not exists idx_price_history_asin_ts on price_history (asin, ts desc);

-- 2b) bsr_history: BSR 時系列
create table if not exists bsr_history (
  asin   text not null references products(asin) on delete cascade,
  ts     timestamptz not null,
  rank   integer,
  primary key (asin, ts)
);
create index if not exists idx_bsr_history_asin_ts on bsr_history (asin, ts desc);

-- 2c) seller_history: 出品者数時系列
create table if not exists seller_history (
  asin       text not null references products(asin) on delete cascade,
  ts         timestamptz not null,
  count_new  integer,
  primary key (asin, ts)
);
create index if not exists idx_seller_history_asin_ts on seller_history (asin, ts desc);

-- 2d) keepa_snapshot: 最新スナップショット (latest only, fast read)
create table if not exists keepa_snapshot (
  asin                  text primary key references products(asin) on delete cascade,
  current_amazon_yen    integer,
  current_new_yen       integer,
  buy_box_yen           integer,
  bsr                   integer,
  count_new             integer,
  count_reviews         integer,
  rating_avg            numeric(3,2),
  monthly_sold          integer,                  -- Keepa 実測 (NULL なら BSR 推定)
  package_weight_g      integer,
  category_tree         jsonb,
  fetched_at            timestamptz not null default now()
);
create index if not exists idx_keepa_snapshot_fetched_at on keepa_snapshot (fetched_at desc);

-- 2e) market_analysis: 5 軸 + ゲート + 複合 score の pre-compute (探索の駆動元)
create table if not exists market_analysis (
  asin                    text primary key references products(asin) on delete cascade,
  axis_demand             integer,                -- 0-100
  axis_competition        integer,
  axis_profit             integer,
  axis_stability          integer,
  axis_differentiation    integer,
  gates_passed            integer,                -- 0-8
  gates_failed            jsonb not null default '[]'::jsonb,
  market_score            numeric(5,2),
  decision                text check (decision in ('go','cond','no_go')),
  monthly_sales_source    text check (monthly_sales_source in ('keepa','bsr','seed')),
  computed_at             timestamptz not null default now()
);
create index if not exists idx_market_score on market_analysis (market_score desc);
create index if not exists idx_market_analysis_decision on market_analysis (decision);

-- 3) analysis: 5軸スコア + ゲート結果 + 利益性 + LLM。履歴保持 (上書き禁止)。
create table if not exists analysis (
  id                          uuid primary key default gen_random_uuid(),
  asin                        text not null references products(asin) on delete cascade,
  score                       integer not null check (score between 0 and 100),
  decision                    text not null check (decision in ('GO','CONDITIONAL_GO','NO_GO')),
  competition_level           text not null check (competition_level in ('LOW','MEDIUM','HIGH')),
  estimated_monthly_revenue   numeric(12,2) not null default 0,
  breakdown                   jsonb not null default '{}'::jsonb,
  rule_checks                 jsonb not null default '[]'::jsonb,
  gates                       jsonb not null default '[]'::jsonb,
  metrics_snapshot            jsonb not null default '{}'::jsonb,
  derived                     jsonb not null default '{}'::jsonb,
  profit                      jsonb not null default '{}'::jsonb,
  summary                     text not null,
  reasons                     jsonb not null default '[]'::jsonb,
  risks                       jsonb not null default '[]'::jsonb,
  actions                     jsonb not null default '[]'::jsonb,
  llm_report                  jsonb not null default '{}'::jsonb,
  prompt_version              text,
  source                      text not null default 'system',
  created_at                  timestamptz not null default now(),
  expires_at                  timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_analysis_asin_created_at on analysis (asin, created_at desc);
create index if not exists idx_analysis_expires_at on analysis (expires_at);

-- 4) discovery_runs: 探索ラン履歴 (除外も保持)
create table if not exists discovery_runs (
  id                      uuid primary key default gen_random_uuid(),
  category                text not null,
  filters                 jsonb not null default '{}'::jsonb,
  generated_keywords      jsonb not null default '[]'::jsonb,
  candidate_count         integer not null default 0,
  candidates              jsonb not null default '[]'::jsonb,
  excluded_candidates     jsonb not null default '[]'::jsonb,
  duration_ms             integer not null default 0,
  source                  text not null default 'mock',
  created_at              timestamptz not null default now()
);
create index if not exists idx_discovery_runs_category_created_at
  on discovery_runs (category, created_at desc);

-- 5) watchlist: 監視対象 ASIN
create table if not exists watchlist (
  asin         text primary key references products(asin) on delete cascade,
  status       text not null default 'candidate'
                 check (status in ('candidate','sourcing','live')),
  added_at     timestamptz not null default now(),
  user_note    text,
  last_change  jsonb
);
create index if not exists idx_watchlist_status on watchlist (status);

-- 6) dictionary: 学習辞書 (除外/有望/NG パターン)
create table if not exists dictionary (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('exclude_brand','exclude_category','promising_keyword','ng_pattern')),
  value       text not null,
  note        text,
  created_at  timestamptz not null default now(),
  unique (type, value)
);
create index if not exists idx_dictionary_type on dictionary (type);

-- 7) purchase_feedback: 仕入後の結果フィードバック (Phase 4 で集計に利用)
create table if not exists purchase_feedback (
  asin            text primary key references products(asin) on delete cascade,
  purchased_at    timestamptz,
  outcome         text not null check (outcome in ('profitable','break_even','loss','abandoned')),
  note            text,
  recorded_at     timestamptz not null default now()
);

-- 8) api_usage: API コスト履歴
create table if not exists api_usage (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null check (provider in ('keepa','gemini','openai','anthropic','spapi')),
  endpoint        text not null,
  cost_estimate   numeric(10,2) not null default 0,
  occurred_at     timestamptz not null default now()
);
create index if not exists idx_api_usage_provider_occurred_at
  on api_usage (provider, occurred_at desc);

-- 9) app_settings: 単一行 KV (cache_only_mode, budget_warned_at など)
create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- 10) analysis_threads: ASIN 別 Q&A 履歴 (4.7 LLM Q&A)
create table if not exists analysis_threads (
  id          uuid primary key default gen_random_uuid(),
  asin        text not null references products(asin) on delete cascade,
  prompt      text not null,
  response    text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_analysis_threads_asin_created_at
  on analysis_threads (asin, created_at desc);

-- 11) discovery_queue: Cron dispatcher が ingestDiscover を循環実行するためのキュー
--     詳細は db/migrations/0003_discovery_queue.sql 参照
create table if not exists discovery_queue (
  id            bigserial primary key,
  category      text not null,
  keyword       text,
  min_price     integer,
  max_price     integer,
  min_reviews   integer,
  max_reviews   integer,
  per_page      integer not null default 50,
  enrich        boolean not null default false,
  priority      smallint not null default 50,
  status        text not null default 'pending'
                  check (status in ('pending','running','done','failed')),
  attempts      smallint not null default 0,
  last_error    text,
  last_run_at   timestamptz,
  ingested_count integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_discovery_queue_next
  on discovery_queue (status, priority desc, last_run_at nulls first);
create index if not exists idx_discovery_queue_status
  on discovery_queue (status);

-- updated_at の自動更新トリガ (products / keepa_data / app_settings / discovery_queue)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_updated_at on products;
create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

drop trigger if exists app_settings_updated_at on app_settings;
create trigger app_settings_updated_at before update on app_settings
  for each row execute function set_updated_at();

drop trigger if exists discovery_queue_updated_at on discovery_queue;
create trigger discovery_queue_updated_at before update on discovery_queue
  for each row execute function set_updated_at();
