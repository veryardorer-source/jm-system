-- 작업일지 임시저장 (2026-08-01)
-- 하루 중간중간 업무가 있을 때마다 적어두고(작성중), 퇴근할 때 제출하는 방식.
-- 기존 일지들은 전부 '제출' 상태로 채워짐.
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.work_logs add column if not exists status text not null default '제출';
