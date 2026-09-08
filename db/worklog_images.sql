-- 작업일지 사진 첨부 (2026-09-03)
-- 현장 사진·참고 이미지를 작업일지에 함께 올릴 수 있게 컬럼 추가.
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.work_logs add column if not exists images jsonb; -- ["https://...", ...]
