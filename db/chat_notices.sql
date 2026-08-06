-- 채팅방 공지 (2026-07-30) — 카톡처럼 대화방 상단에 고정되는 공지글. 등록·수정·삭제 가능.
-- conv_key: 'all'(전체 채팅) | 'room:<방id>' | 'dm:<id:id 정렬>' (1:1)
-- Supabase SQL Editor에서 한 번 실행하세요.

create table if not exists chat_notices (
  conv_key    text primary key,
  content     text not null default '',
  author_name text default '',
  updated_at  timestamptz not null default now()
);

alter table chat_notices enable row level security;

-- 승인된 직원(협력업체 제외)만 읽고 쓸 수 있음 — 채팅 자체가 협력업체 차단이라 동일 기준
drop policy if exists chat_notices_sel on chat_notices;
create policy chat_notices_sel on chat_notices
  for select to authenticated using (is_approved() and my_role() <> 'partner');

drop policy if exists chat_notices_write on chat_notices;
create policy chat_notices_write on chat_notices
  for all to authenticated
  using (is_approved() and my_role() <> 'partner')
  with check (is_approved() and my_role() <> 'partner');

-- 실시간 반영 (이미 추가돼 있으면 무시)
do $$ begin
  alter publication supabase_realtime add table chat_notices;
exception when duplicate_object then null; end $$;
