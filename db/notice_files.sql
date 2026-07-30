-- 공지사항 파일 첨부 (PDF·엑셀 등) — Supabase SQL Editor에서 1회 실행
alter table public.notices add column if not exists files jsonb;
