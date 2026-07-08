-- 작업일지(work_logs) — jm-system Supabase에서 1회 실행
-- ⚠️ 선행: db/rls_helpers.sql 먼저 실행 (public.my_role() 함수 필요)
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

-- RLS: 내부 업무기록 → admin/designer/field만 (partner·pending 차단. 구버전 전체허용 폐기 — 2026-07-07)
alter table public.work_logs enable row level security;
drop policy if exists "work_logs auth all" on public.work_logs;
drop policy if exists worklogs_staff on public.work_logs;
create policy worklogs_staff on public.work_logs for all to authenticated
  using (public.my_role() in ('admin','designer','field'))
  with check (public.my_role() in ('admin','designer','field'));
