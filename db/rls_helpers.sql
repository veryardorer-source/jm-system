-- =============================================================
-- RLS 공통 헬퍼 함수 (2026-07-07 분리)
-- ⚠️ 새 DB 세팅 시 "가장 먼저" 실행하세요. 다른 db/*.sql이 이 함수들을 사용합니다.
-- 모두 create or replace 라 몇 번을 실행해도 안전 (rls_sensitive/rls_chat/rls_money에
-- 동일 정의가 포함돼 있어도 충돌 없음 — 같은 내용으로 덮어씀).
--
-- ── 새 DB 세팅 실행 순서 ──
--  1. rls_helpers.sql            (이 파일 — 공통 함수)
--  2. security_and_realtime.sql  (기본 테이블 + 공용 정책 + realtime)
--  3. 기능 테이블: payments.sql, worklogs.sql, push_subscriptions.sql,
--     finance_quotes.sql, employee_records.sql, chat_features.sql, chat_reads.sql,
--     payroll_ledger.sql, profit_file.sql, ...
--  4. rls_notifications.sql      (알림 정책 — 이거 없으면 알림 접근 차단됨)
--  5. rls_chat.sql               (채팅 정책 — 이거 없으면 채팅 접근 차단됨)
--  6. rls_sensitive.sql          (민감정보 admin 전용)
--  7. rls_money.sql              (금전/서류/현장자료 역할별)
-- =============================================================

-- 요청 사용자의 역할 (profiles.role)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

-- 승인된 사용자인가 (admin/designer/field/partner — pending 제외)
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('admin','designer','field','partner')
                       from public.profiles where id = auth.uid()), false) $$;

-- 채팅방 멤버인가
create or replace function public.is_room_member(rid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.chat_room_members
                    where room_id = rid and user_id = auth.uid()) $$;

-- 해당 메시지를 볼 수 있는가 (전체채팅 / 내 DM / 내가 속한 방)
create or replace function public.can_see_message(mid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.messages m
    where m.id = mid and (
      (m.room_id is null and m.recipient_id is null)
      or (m.recipient_id is not null and (m.sender_id = auth.uid() or m.recipient_id = auth.uid()))
      or (m.room_id is not null and public.is_room_member(m.room_id))
    ))
$$;

-- 특정 테이블의 기존 정책 전부 제거 (정책 교체용)
create or replace function public._drop_all_policies(tbl text)
returns void language plpgsql as $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename=tbl loop
    execute format('drop policy if exists %I on public.%I', p.policyname, tbl);
  end loop;
end $$;
