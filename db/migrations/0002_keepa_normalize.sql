-- Migration 0002: Keepa data normalization (R1)
-- - Adds price_history / bsr_history / seller_history (時系列)
-- - Adds keepa_snapshot (latest 値専用、軽量読み出し)
-- - Adds market_analysis (5 軸 + ゲート + market_score を pre-compute)
-- - Adds products.tier / keepa_last_full_at / keepa_last_diff_at
-- - 旧 keepa_data の最新値は keepa_snapshot に転記してから DROP
-- 適用後は db/schema.sql 側にも反映されている。idempotent な書き方にしてあるので
-- 同じ環境で複数回実行しても安全。

begin;

-- ─── 1) products に refresh 管理列を追加 ──────────────────────────────────
alter table products
  add column if not exists keepa_last_full_at timestamptz;
alter table products
  add column if not exists keepa_last_diff_at timestamptz;
alter table products
  add column if not exists tier smallint not null default 3;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_tier_check'
  ) then
    alter table products add constraint products_tier_check check (tier in (1,2,3));
  end if;
end $$;

create index if not exists idx_products_tier on products (tier);
create index if not exists idx_products_last_diff on products (keepa_last_diff_at);

-- ─── 2) price_history (Amazon/New/Used/BuyBox を 1 テーブル) ──────────────
create table if not exists price_history (
  asin        text not null references products(asin) on delete cascade,
  price_type  text not null check (price_type in ('amazon','new','used','buybox')),
  ts          timestamptz not null,
  price_yen   integer,            -- NULL = 在庫なし
  primary key (asin, price_type, ts)
);
create index if not exists idx_price_history_asin_ts on price_history (asin, ts desc);

-- ─── 3) bsr_history ─────────────────────────────────────────────────────
create table if not exists bsr_history (
  asin   text not null references products(asin) on delete cascade,
  ts     timestamptz not null,
  rank   integer,
  primary key (asin, ts)
);
create index if not exists idx_bsr_history_asin_ts on bsr_history (asin, ts desc);

-- ─── 4) seller_history ───────────────────────────────────────────────────
create table if not exists seller_history (
  asin       text not null references products(asin) on delete cascade,
  ts         timestamptz not null,
  count_new  integer,
  primary key (asin, ts)
);
create index if not exists idx_seller_history_asin_ts on seller_history (asin, ts desc);

-- ─── 5) keepa_snapshot (latest 値専用) ───────────────────────────────────
create table if not exists keepa_snapshot (
  asin                  text primary key references products(asin) on delete cascade,
  current_amazon_yen    integer,
  current_new_yen       integer,
  buy_box_yen           integer,
  bsr                   integer,
  count_new             integer,
  count_reviews         integer,
  rating_avg            numeric(3,2),
  monthly_sold          integer,        -- Keepa 実測 (NULL なら BSR 推定)
  package_weight_g      integer,
  category_tree         jsonb,
  fetched_at            timestamptz not null default now()
);
create index if not exists idx_keepa_snapshot_fetched_at on keepa_snapshot (fetched_at desc);

-- ─── 6) market_analysis (5 軸 + ゲート + 複合 score) ─────────────────────
create table if not exists market_analysis (
  asin                    text primary key references products(asin) on delete cascade,
  axis_demand             integer,    -- 0-100
  axis_competition        integer,
  axis_profit             integer,
  axis_stability          integer,
  axis_differentiation    integer,
  gates_passed            integer,    -- 0-8
  gates_failed            jsonb not null default '[]'::jsonb,
  market_score            numeric(5,2),
  decision                text check (decision in ('go','cond','no_go')),
  monthly_sales_source    text check (monthly_sales_source in ('keepa','bsr','seed')),
  computed_at             timestamptz not null default now()
);
create index if not exists idx_market_score on market_analysis (market_score desc);
create index if not exists idx_market_analysis_decision on market_analysis (decision);

-- ─── 7) 旧 keepa_data → keepa_snapshot へ転記 ──────────────────────────
-- 既存データを安全に移行 (idempotent: keepa_data がない or 既に snapshot に存在 → no-op)
do $$
declare
  has_keepa_data boolean;
begin
  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'keepa_data'
  ) into has_keepa_data;

  if has_keepa_data then
    -- 旧 keepa_data から最新 price/bsr/seller を抽出して keepa_snapshot に upsert
    insert into keepa_snapshot (
      asin, current_new_yen, bsr, count_new, fetched_at
    )
    select
      kd.asin,
      -- price_history は jsonb 配列 [{timestamp, value}]。最後の value (yen) を抽出
      (
        select (elem->>'value')::int
          from jsonb_array_elements(kd.price_history) elem
         order by (elem->>'timestamp') desc
         limit 1
      ) as current_new_yen,
      (
        select (elem->>'value')::int
          from jsonb_array_elements(kd.bsr_history) elem
         order by (elem->>'timestamp') desc
         limit 1
      ) as bsr,
      (
        select (elem->>'value')::int
          from jsonb_array_elements(kd.seller_history) elem
         order by (elem->>'timestamp') desc
         limit 1
      ) as count_new,
      kd.updated_at as fetched_at
    from keepa_data kd
    on conflict (asin) do nothing;

    -- 旧 keepa_data の price_history を全部 price_history テーブルに転記 (price_type='new')
    insert into price_history (asin, price_type, ts, price_yen)
    select
      kd.asin,
      'new'::text as price_type,
      (elem->>'timestamp')::timestamptz as ts,
      nullif((elem->>'value')::int, 0) as price_yen
    from keepa_data kd, jsonb_array_elements(kd.price_history) elem
    where (elem->>'timestamp') is not null
    on conflict (asin, price_type, ts) do nothing;

    insert into bsr_history (asin, ts, rank)
    select
      kd.asin,
      (elem->>'timestamp')::timestamptz as ts,
      (elem->>'value')::int as rank
    from keepa_data kd, jsonb_array_elements(kd.bsr_history) elem
    where (elem->>'timestamp') is not null
    on conflict (asin, ts) do nothing;

    insert into seller_history (asin, ts, count_new)
    select
      kd.asin,
      (elem->>'timestamp')::timestamptz as ts,
      (elem->>'value')::int as count_new
    from keepa_data kd, jsonb_array_elements(kd.seller_history) elem
    where (elem->>'timestamp') is not null
    on conflict (asin, ts) do nothing;

    -- 旧 keepa_data.updated_at を products.keepa_last_full_at に反映
    update products p
       set keepa_last_full_at = kd.updated_at,
           keepa_last_diff_at = kd.updated_at
      from keepa_data kd
     where kd.asin = p.asin
       and (p.keepa_last_full_at is null or kd.updated_at > p.keepa_last_full_at);
  end if;
end $$;

-- ─── 8) 旧 keepa_data を削除 ───────────────────────────────────────────
-- アプリ側コードが keepa_data 参照を停止した後でないと実行できない。
-- Phase 2 の ingest API デプロイ完了後、別マイグレーション or 手動で:
--   drop table if exists keepa_data cascade;
-- ここでは drop しない (ロールバック余地を残す)。

-- ─── 9) RLS: 新テーブルにも認証済みユーザー full access ────────────────
alter table price_history    enable row level security;
alter table bsr_history      enable row level security;
alter table seller_history   enable row level security;
alter table keepa_snapshot   enable row level security;
alter table market_analysis  enable row level security;

do $$
declare
  tbl text;
  tables text[] := array['price_history','bsr_history','seller_history','keepa_snapshot','market_analysis'];
begin
  foreach tbl in array tables
  loop
    execute format('drop policy if exists "authenticated_full_access" on %I', tbl);
    execute format(
      'create policy "authenticated_full_access" on %I for all
         using (auth.uid() is not null)
         with check (auth.uid() is not null)',
      tbl
    );
  end loop;
end $$;

commit;
