-- 비밀번호 재설정 링크 (2026-08-13) — 초대장 테이블을 확장해 재설정 용도로도 사용.
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.invite_tokens add column if not exists kind text not null default 'invite'
  check (kind in ('invite','reset'));
alter table public.invite_tokens add column if not exists target_user uuid;
