-- 직원 초대장 (2026-08-11) — 카톡으로 보내는 초대 링크의 원본.
-- 링크 유효기간을 우리가 정한다(기본 7일). 서버(service role)만 읽고 쓰므로
-- RLS를 켜고 정책을 만들지 않는다 = 클라이언트 접근 전면 차단.
-- Supabase SQL Editor에서 한 번 실행하세요.

create table if not exists public.invite_tokens (
  token      text primary key,
  email      text not null,
  name       text not null,
  role       text not null check (role in ('admin','designer','field','partner')),
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.invite_tokens enable row level security;
