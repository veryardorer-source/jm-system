-- =============================================================
-- ⚠️ 구버전 정리됨 (2026-07-07) — 재실행해도 보안이 느슨해지지 않게 수정.
-- 원본(2026-06-22 적용)은 전체 테이블에 authenticated 전체허용(auth_all)을 걸었으나,
-- 이후 테이블별 세분화 RLS로 대체됨. 현재 기준:
--   · 민감(employees/급여/근태/finance_*)  → db/rls_sensitive.sql (admin 전용)
--   · 금전/서류/현장자료                    → db/rls_money.sql
--   · 채팅(messages/rooms/members/반응/읽음) → db/rls_chat.sql
--   · 알림(notifications)                   → db/rls_notifications.sql
-- 이 파일은 ①기본 테이블 생성 ②의도적으로 전직원(authenticated) 공용인
-- 테이블의 정책 ③realtime 발행만 담당한다. 적용 현황: 관리시스템/docs/security_status.md
-- =============================================================

-- ① 전직원 공용 테이블만 auth_all 유지 (금전·민감·채팅 테이블 아님)
do $$
declare t text;
begin
  foreach t in array array[
    'notices','profiles','project_assignments','projects','schedules'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists auth_all on public.%I;', t);
    execute format('create policy auth_all on public.%I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ② 채팅(messages) — 테이블 생성만. 정책은 db/rls_chat.sql 실행 (여기서 만들지 않음)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete set null,
  sender_name text,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
-- (구) auth_all 정책 제거 — 참여자 기준 정책은 rls_chat.sql
drop policy if exists auth_all on public.messages;

-- ② 알림(notifications) — 테이블 생성만. 정책은 db/rls_notifications.sql 실행
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, is_read);
alter table public.notifications enable row level security;
drop policy if exists auth_all on public.notifications;

-- ② 실시간 발행(publication) — 이미 추가돼 있으면 에러 무시 가능
do $$ begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;

-- ③ 채팅 1:1 + 채팅방(그룹) — 테이블/인덱스 생성만. 정책은 db/rls_chat.sql
alter table public.messages add column if not exists recipient_id uuid;  -- 1:1 (null=전체/방)
create index if not exists idx_messages_recipient on public.messages(recipient_id);
alter table public.messages add column if not exists room_id uuid;        -- 채팅방
create index if not exists idx_messages_room on public.messages(room_id);
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(), name text not null, created_by uuid, created_at timestamptz not null default now());
create table if not exists public.chat_room_members (
  room_id uuid references public.chat_rooms(id) on delete cascade, user_id uuid not null,
  created_at timestamptz not null default now(), primary key (room_id, user_id));
alter table public.chat_rooms enable row level security;
drop policy if exists auth_all on public.chat_rooms;
alter table public.chat_room_members enable row level security;
drop policy if exists auth_all on public.chat_room_members;
-- ⚠️ 위 채팅/알림 테이블에 정책이 하나도 없으면 접근이 전부 차단됨 —
--     새 DB에 세팅할 때는 이 파일 실행 후 반드시 rls_chat.sql / rls_notifications.sql 실행.
