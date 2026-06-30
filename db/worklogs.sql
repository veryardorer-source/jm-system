-- 작업일지(work_logs) — jm-system Supabase에서 1회 실행
create table if not exists public.work_logs (
  id            uuid primary key default gen_random_uuid(),
  log_date      date not null default current_date,
  today_work    text,
  tomorrow_work text,
  memo          text,
  author        text,
  author_id     uuid,
  created_at    timestamptz not null default now()
);

alter table public.work_logs enable row level security;
drop policy if exists "work_logs auth all" on public.work_logs;
create policy "work_logs auth all" on public.work_logs
  for all to authenticated using (true) with check (true);
