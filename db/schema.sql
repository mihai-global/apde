-- APDE Supabase スキーマ (要件 v1.1 §8 準拠)
-- 適用順: schema.sql → rls.sql → seed.sql

create extension if not exists "pgcrypto";

-- 1) products: ASIN マスタ
create table if not exists products (
  asin            text primary key,
  title           text not null,
  category        text not null,
  brand           text,
  image_url       text,
  current_price   numeric(10,2),
  weight_grams    integer,
  size_tier       text check (size_tier in ('SMALL_STANDARD','LARGE_STANDARD','OVERSIZE')),
  review_count    integer not null default 0,
  seller_count    integer not null default 0,
  brand_strength  numeric(5,2),                -- 0-100, 上位3ブランド集中度
  rating          numeric(3,2),
  is_hazmat       boolean not null default false,
  is_regulated    boolean not null default false,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_products_category on products (category);
create index if not exists idx_products_updated_at on products (updated_at desc);

-- 2) keepa_data: 時系列 + 派生指標
create table if not exists keepa_data (
  asin              text primary key references products(asin) on delete cascade,
  price_history     jsonb not null default '[]'::jsonb,
  bsr_history       jsonb not null default '[]'::jsonb,
  seller_history    jsonb not null default '[]'::jsonb,
  buy_box_history   jsonb not null default '[]'::jsonb,
  derived_metrics   jsonb not null default '{}'::jsonb,
  source            text not null default 'keepa',
  updated_at        timestamptz not null default now()
);
create index if not exists idx_keepa_updated_at on keepa_data (updated_at desc);

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

-- updated_at の自動更新トリガ (products / keepa_data / app_settings)
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

drop trigger if exists keepa_data_updated_at on keepa_data;
create trigger keepa_data_updated_at before update on keepa_data
  for each row execute function set_updated_at();

drop trigger if exists app_settings_updated_at on app_settings;
create trigger app_settings_updated_at before update on app_settings
  for each row execute function set_updated_at();
