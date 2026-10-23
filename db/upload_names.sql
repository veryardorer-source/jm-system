-- 출금 요청·영수증 사진의 원래 파일 이름 기록 — 내려받을 때 올린 이름 그대로 나오게 (2026-10-23)
-- 저장소 경로는 한글을 못 쓰므로(숫자 이름으로 저장) 원래 이름은 표에 따로 남긴다.
-- jm-system Supabase SQL Editor에서 1회 실행 (재실행 안전). 기존 RLS 그대로.

alter table public.withdrawal_requests add column if not exists image_names jsonb;  -- images 와 같은 순서의 원래 이름 목록
alter table public.receipts add column if not exists file_name text;                 -- 영수증 사진 원래 이름
