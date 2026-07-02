-- =============================================================
-- 채팅 RLS 정비 (2026-07-02) — 우선순위 1
-- messages / chat_rooms / chat_room_members / message_reactions / chat_reads
-- 기존 auth_all(전체 허용) 정책을 제거하고 참여자·본인 기준으로 제한.
-- ⚠ 운영 데이터 접근에 영향 → SQL Editor에서 검토 후 실행. 실행 전 스냅샷 권장.
-- =============================================================

-- ── 헬퍼 함수 (security definer: 정책 안에서 자기 테이블을 다시 조회해도 재귀 안 걸리게) ──
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('admin','designer','field','partner')
                       from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_room_member(rid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.chat_room_members
                    where room_id = rid and user_id = auth.uid()) $$;

-- 메시지 가시성(반응 정책에서 재사용)
create or replace function public.can_see_message(mid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.messages m
    where m.id = mid and (
      (m.room_id is null and m.recipient_id is null)                                   -- 전체 채팅
      or (m.recipient_id is not null and (m.sender_id = auth.uid() or m.recipient_id = auth.uid()))  -- 1:1 DM
      or (m.room_id is not null and public.is_room_member(m.room_id))                   -- 방
    ))
$$;

-- 특정 테이블의 모든 기존 정책 제거용
create or replace function public._drop_all_policies(tbl text)
returns void language plpgsql as $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename=tbl loop
    execute format('drop policy if exists %I on public.%I', p.policyname, tbl);
  end loop;
end $$;

-- ── messages ──
alter table public.messages enable row level security;
select public._drop_all_policies('messages');

create policy messages_select on public.messages for select to authenticated
using (
  public.is_approved() and (
    (room_id is null and recipient_id is null)
    or (recipient_id is not null and (sender_id = auth.uid() or recipient_id = auth.uid()))
    or (room_id is not null and public.is_room_member(room_id))
  )
);

-- 보내기: 승인자 + 본인 명의 + 파트너(보기전용)·pending(미승인) 차단 + 보이는 대화로만
create policy messages_insert on public.messages for insert to authenticated
with check (
  public.is_approved()
  and sender_id = auth.uid()
  and public.my_role() <> 'partner'
  and (
    (room_id is null and recipient_id is null)
    or (recipient_id is not null)
    or (room_id is not null and public.is_room_member(room_id))
  )
);

-- 수정/고정/소프트삭제(UPDATE): 본인 메시지 또는 admin. (고정도 작성자/admin만)
create policy messages_update on public.messages for update to authenticated
using (sender_id = auth.uid() or public.my_role() = 'admin')
with check (sender_id = auth.uid() or public.my_role() = 'admin');

-- 하드 삭제: 본인 또는 admin
create policy messages_delete on public.messages for delete to authenticated
using (sender_id = auth.uid() or public.my_role() = 'admin');

-- ── chat_rooms ──
alter table public.chat_rooms enable row level security;
select public._drop_all_policies('chat_rooms');

create policy rooms_select on public.chat_rooms for select to authenticated
using (public.is_room_member(id) or public.my_role() = 'admin');

create policy rooms_insert on public.chat_rooms for insert to authenticated
with check (public.is_approved() and public.my_role() <> 'partner' and created_by = auth.uid());

create policy rooms_update on public.chat_rooms for update to authenticated
using (created_by = auth.uid() or public.my_role() = 'admin')
with check (created_by = auth.uid() or public.my_role() = 'admin');

create policy rooms_delete on public.chat_rooms for delete to authenticated
using (created_by = auth.uid() or public.my_role() = 'admin');

-- ── chat_room_members ──
alter table public.chat_room_members enable row level security;
select public._drop_all_policies('chat_room_members');

create policy members_select on public.chat_room_members for select to authenticated
using (public.is_room_member(room_id) or public.my_role() = 'admin');

-- 추가: 방 생성자 또는 admin
create policy members_insert on public.chat_room_members for insert to authenticated
with check (
  public.my_role() = 'admin'
  or (select created_by from public.chat_rooms where id = room_id) = auth.uid()
);

-- 삭제(내보내기/나가기): 방 생성자·admin, 또는 본인 나가기
create policy members_delete on public.chat_room_members for delete to authenticated
using (
  public.my_role() = 'admin'
  or (select created_by from public.chat_rooms where id = room_id) = auth.uid()
  or user_id = auth.uid()
);

-- ── message_reactions ──
alter table public.message_reactions enable row level security;
select public._drop_all_policies('message_reactions');

create policy reactions_select on public.message_reactions for select to authenticated
using (public.is_approved() and public.can_see_message(message_id));

create policy reactions_insert on public.message_reactions for insert to authenticated
with check (public.is_approved() and user_id = auth.uid() and public.my_role() <> 'partner' and public.can_see_message(message_id));

create policy reactions_delete on public.message_reactions for delete to authenticated
using (user_id = auth.uid());

-- ── chat_reads ──
alter table public.chat_reads enable row level security;
select public._drop_all_policies('chat_reads');

-- 볼 수 있는 읽음행: 내 행 / 나와의 DM 상대 행 / 내가 속한 방
create policy reads_select on public.chat_reads for select to authenticated
using (
  user_id = auth.uid()
  or conv_key = 'dm:' || auth.uid()::text
  or (conv_key like 'room:%' and public.is_room_member(nullif(substring(conv_key from 6), '')::uuid))
);

create policy reads_insert on public.chat_reads for insert to authenticated
with check (user_id = auth.uid());

create policy reads_update on public.chat_reads for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
