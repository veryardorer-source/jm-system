-- 2026-11: 이달 특별수당 + 별도 퇴직금·퇴직연금 지급 내역
-- 운영 DB에 적용하기 전 스냅샷을 확인하고 대표 승인을 받는다.
-- 선행: db/rls_helpers.sql (is_payroll_viewer)

alter table public.payroll_items
  add column if not exists special_allowance bigint not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.payroll_items'::regclass and conname = 'payroll_items_special_nonnegative') then
    alter table public.payroll_items add constraint payroll_items_special_nonnegative check (special_allowance >= 0);
  end if;
end $$;

create table if not exists public.retirement_settlements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  paid_on date not null,
  kind text not null check (kind in ('퇴직금', '퇴직연금')),
  amount bigint not null default 0 check (amount >= 0),
  income_tax bigint not null default 0 check (income_tax >= 0),
  local_tax bigint not null default 0 check (local_tax >= 0),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retirement_settlements_deductions_check check (income_tax + local_tax <= amount)
);
create index if not exists retirement_settlements_paid_on_idx on public.retirement_settlements (paid_on);

-- 기존 급여 열람자(대표·이사)만 읽기·쓰기 가능. 급여대장 합계와 별개.
alter table public.retirement_settlements enable row level security;
drop policy if exists "payroll viewer only" on public.retirement_settlements;
create policy "payroll viewer only" on public.retirement_settlements for all to authenticated
  using (public.is_payroll_viewer()) with check (public.is_payroll_viewer());

-- 이미 설치된 감사 정책도 새 민감 테이블에 맞춰 제한한다.
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    drop policy if exists audit_select_admin on public.audit_logs;
    create policy audit_select_admin on public.audit_logs for select to authenticated using (
      public.my_role() = 'admin'
      and (table_name not in ('employee_pay_settings', 'payroll_items', 'retirement_settlements')
           or public.is_payroll_viewer())
    );
  end if;
end $$;

-- 감사 로그가 설치된 환경이면 퇴직 정산 수정/삭제도 기록한다.
do $$
begin
  if to_regprocedure('public.log_audit()') is not null then
    drop trigger if exists audit_retirement_settlements on public.retirement_settlements;
    create trigger audit_retirement_settlements after insert or update or delete on public.retirement_settlements
      for each row execute function public.log_audit();
  end if;
end $$;
