-- 個人運用前提の RLS。認証済みユーザーのみ全テーブル操作可。匿名は読み取り不可。
-- 参考: https://supabase.com/docs/guides/database/postgres/row-level-security

alter table products              enable row level security;
alter table keepa_data            enable row level security;
alter table analysis              enable row level security;
alter table discovery_runs        enable row level security;
alter table watchlist             enable row level security;
alter table dictionary            enable row level security;
alter table purchase_feedback     enable row level security;
alter table api_usage             enable row level security;
alter table app_settings          enable row level security;
alter table analysis_threads      enable row level security;

-- 共通ポリシー: 認証済みなら full access (single-user 想定)
do $$
declare
  tbl text;
  tables text[] := array[
    'products','keepa_data','analysis','discovery_runs','watchlist','dictionary',
    'purchase_feedback','api_usage','app_settings','analysis_threads'
  ];
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
