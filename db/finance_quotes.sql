-- 재정관리 견적서 카테고리 — jm-system Supabase에서 1회 실행
create table if not exists public.finance_quotes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  quote_date  date,
  amount      bigint not null default 0,
  memo        text,
  file_url    text,
  file_name   text,
  created_at  timestamptz not null default now()
);
alter table public.finance_quotes enable row level security;
drop policy if exists "finance_quotes auth all" on public.finance_quotes;
create policy "finance_quotes auth all" on public.finance_quotes for all to authenticated using (true) with check (true);
