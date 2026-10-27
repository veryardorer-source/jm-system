-- 견적서 탭 2단계 확인 — 1단계: 견적서 올리면 금액 자동 반영 / 2단계: 대표가 계약서와 맞춰 보고 [확인]
-- jm-system Supabase SQL Editor에서 1회 실행 (quote_profit.sql 다음, 재실행 안전)
alter table public.finance_quotes add column if not exists confirmed    boolean not null default false;
alter table public.finance_quotes add column if not exists confirmed_at timestamptz;

-- 새 칸을 API가 바로 알아보도록
notify pgrst, 'reload schema';
