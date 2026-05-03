create table if not exists products (
  asin text primary key,
  title text not null,
  category text not null,
  brand text,
  image_url text,
  current_price numeric(10, 2),
  review_count integer not null default 0,
  seller_count integer not null default 0,
  weight_grams integer,
  size_tier text,
  gross_margin_rate numeric(5, 2),
  ad_cpc_estimate numeric(8, 2),
  oem_feasibility integer,
  regulatory_risk text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists keepa_data (
  asin text primary key references products(asin) on delete cascade,
  price_history jsonb not null default '[]'::jsonb,
  bsr_history jsonb not null default '[]'::jsonb,
  seller_history jsonb not null default '[]'::jsonb,
  buy_box_history jsonb not null default '[]'::jsonb,
  keepa_graph_url text,
  source text not null default 'keepa',
  updated_at timestamptz not null default now()
);

create table if not exists analysis (
  id bigserial primary key,
  asin text not null references products(asin) on delete cascade,
  score integer not null check (score between 0 and 100),
  decision text not null check (decision in ('GO', 'CONDITIONAL_GO', 'NO_GO')),
  competition_level text not null check (competition_level in ('LOW', 'MEDIUM', 'HIGH')),
  estimated_monthly_revenue numeric(12, 2) not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  rule_checks jsonb not null default '[]'::jsonb,
  metrics_snapshot jsonb not null default '{}'::jsonb,
  summary text not null,
  reasons jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  llm_report jsonb not null default '{}'::jsonb,
  source text not null default 'system',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists discovery_runs (
  id bigserial primary key,
  category text not null,
  filters jsonb not null default '{}'::jsonb,
  generated_keywords jsonb not null default '[]'::jsonb,
  candidate_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_category on products (category);
create index if not exists idx_keepa_updated_at on keepa_data (updated_at desc);
create index if not exists idx_analysis_asin_created_at on analysis (asin, created_at desc);
create index if not exists idx_analysis_expires_at on analysis (expires_at);
create index if not exists idx_discovery_runs_category_created_at on discovery_runs (category, created_at desc);
