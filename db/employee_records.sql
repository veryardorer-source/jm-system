-- 직원별 급여 + 근태 — jm-system Supabase에서 1회 실행
-- ⚠️ 선행: db/rls_helpers.sql 먼저 실행 (public.my_role() 함수 필요)

-- 급여 내역 (직원별 월 급여)
create table if not exists public.employee_salaries (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  month       text,            -- 'YYYY-MM'
  amount      bigint not null default 0,
  memo        text,
  created_at  timestamptz not null default now()
);
-- RLS: 급여 → 관리자 전용 (rls_sensitive.sql 기준. 구버전 전체허용 폐기 — 2026-07-07)
alter table public.employee_salaries enable row level security;
drop policy if exists "emp_sal auth all" on public.employee_salaries;
drop policy if exists "admin only" on public.employee_salaries;
create policy "admin only" on public.employee_salaries for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- 근태 내역 (지각/조퇴/결근/연차/반차/기타)
create table if not exists public.employee_attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  att_date    date,
  att_type    text not null default '지각',
  memo        text,
  created_at  timestamptz not null default now()
);
-- RLS: 근태 → 관리자 전용 (rls_sensitive.sql 기준. 구버전 전체허용 폐기 — 2026-07-07)
alter table public.employee_attendance enable row level security;
drop policy if exists "emp_att auth all" on public.employee_attendance;
drop policy if exists "admin only" on public.employee_attendance;
create policy "admin only" on public.employee_attendance for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
