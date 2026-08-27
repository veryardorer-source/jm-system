-- 작업일지 양식 개편 (2026-08-27) — 대표 지정 양식
-- 맡은 업무(예상/실제 마감시간 포함) 목록 컬럼 추가.
-- 기존 일지(글 방식)는 그대로 보이고, 새 일지부터 새 양식 사용.
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.work_logs add column if not exists tasks jsonb; -- [{"text":"업무","eta":"15:00","actual":"16:30"}, ...]
