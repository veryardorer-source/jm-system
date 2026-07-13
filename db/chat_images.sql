-- 채팅 사진 묶음 전송 — 여러 장을 한 메시지로 (카톡식)
-- Supabase SQL Editor에서 1회 실행
alter table public.messages add column if not exists images jsonb;
