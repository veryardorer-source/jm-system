-- 직원 추가근무(연장·야간·휴일) 기록 (2026-10-06)
-- 관리자가 직원별로 추가근무 날짜·시간·구분을 기록하고, 월별로 합계를 본다.
-- Supabase SQL Editor에서 한 번 실행하세요. (재실행 안전)
-- ⚠️ 선행: db/rls_helpers.sql 먼저 실행 (public.my_role() 함수 필요)

create table if not exists public.employee_overtime (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  work_date    date not null,
  ot_type      text not null default '연장' check (ot_type in ('연장','야간','휴일')),
  start_time   text,                        -- 'HH:MM' (선택)
  end_time     text,                        -- 'HH:MM' (선택, 자정 넘기면 다음날로 계산)
  hours        numeric(5,2) not null check (hours > 0 and hours <= 24),
  project_name text,                        -- 현장명 (선택)
  memo         text,
  created_at   timestamptz not null default now()
);
create index if not exists employee_overtime_date_idx on public.employee_overtime (work_date);
create index if not exists employee_overtime_emp_idx  on public.employee_overtime (employee_id, work_date);

-- RLS: 관리자 전용 (급여 계산 근거 — 직원정보·급여·근태와 같은 등급)
alter table public.employee_overtime enable row level security;
drop policy if exists "admin only" on public.employee_overtime;
create policy "admin only" on public.employee_overtime for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- 감사 기록(누가 언제 넣고·고치고·지웠는지) — audit_logs.sql이 적용된 DB에서만 부착
do $$
begin
  if to_regprocedure('public.log_audit()') is not null then
    drop trigger if exists audit_employee_overtime on public.employee_overtime;
    create trigger audit_employee_overtime after insert or update or delete on public.employee_overtime
      for each row execute function public.log_audit();
  end if;
end $$;
