-- 상여금 대장 보관 (2026-09-23)
-- 급여대장 표(finance_payroll_ledger)에 '종류'를 추가해 같은 달의 급여대장과 상여금대장을 함께 보관한다.
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.finance_payroll_ledger add column if not exists kind  text not null default '급여';
alter table public.finance_payroll_ledger add column if not exists title text;   -- 예: '추석 상여금'

-- 기본키를 (월) → (월, 종류)로 변경: 같은 달에 급여대장과 상여금대장이 모두 있을 수 있음
alter table public.finance_payroll_ledger drop constraint if exists finance_payroll_ledger_pkey;
alter table public.finance_payroll_ledger add primary key (month, kind);
