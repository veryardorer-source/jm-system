-- 급여대장 전체 시트 저장 (월별 1행: 항목명 + 직원별 값 + 총합계)
-- 수당·공제 모든 항목을 그대로 보관해 앱에서 원본 표로 조회.
-- Supabase SQL Editor에서 한 번 실행하세요.

create table if not exists public.finance_payroll_ledger (
  month      text primary key,          -- 'YYYY-MM'
  headers    jsonb not null,            -- ["성명","기본급",...,"차감지급액"]
  rows       jsonb not null,            -- [["이소연","6,475,000",...], ...]
  total      jsonb,                     -- 총 합계 행
  updated_at timestamptz not null default now()
);

-- 민감정보(급여) → 관리자 전용 RLS
alter table public.finance_payroll_ledger enable row level security;
drop policy if exists "admin only" on public.finance_payroll_ledger;
create policy "admin only" on public.finance_payroll_ledger
  for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');
