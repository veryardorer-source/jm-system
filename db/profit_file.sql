-- 현장별 이익(finance_project_profit)에 손익표 파일 첨부 컬럼 추가
-- Supabase SQL Editor에서 한 번 실행하세요. (RLS는 기존 admin 전용 그대로)
alter table public.finance_project_profit add column if not exists file_url  text default '';
alter table public.finance_project_profit add column if not exists file_name text default '';
