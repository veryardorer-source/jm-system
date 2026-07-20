-- 공지사항 이미지 첨부 (캡처 붙여넣기 등) — Supabase SQL Editor에서 1회 실행
alter table public.notices add column if not exists images jsonb;
