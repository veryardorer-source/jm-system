-- =============================================================
-- 1단계 보안 보강 (2026-08-11) — Supabase SQL Editor에서 한 번 실행
-- 핵심: profiles 전체 허용(auth_all) 폐기.
--   기존에는 로그인만 하면 누구나(승인 대기 포함) 아무 profiles 행이나 수정 가능
--   → 자기 role을 'admin'으로 바꾸는 권한 상승이 DB 레벨에서 가능했음. 이를 차단한다.
-- 부가: 공지 역할별 제한, 알림 임의 생성 차단, role 허용값 체크.
-- 몇 번을 다시 실행해도 안전(멱등).
-- =============================================================

-- 공통 헬퍼 (이미 있으면 같은 내용으로 덮어씀)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('admin','designer','field','partner')
                       from public.profiles where id = auth.uid()), false) $$;

create or replace function public._drop_all_policies(tbl text)
returns void language plpgsql as $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename=tbl loop
    execute format('drop policy if exists %I on public.%I', p.policyname, tbl);
  end loop;
end $$;

-- ── ① profiles: 전체 허용 폐기 → 읽기/자기가입/관리자수정 ──
alter table public.profiles enable row level security;
select public._drop_all_policies('profiles');

-- 읽기: 승인된 직원은 전체(채팅 상대 목록 등에 필요), 미승인은 본인 행만(승인 대기 화면 표시용)
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_approved() or id = auth.uid());

-- 만들기: 클라이언트에서는 불가 — 공개 가입 폐쇄(2026-08-11, 초대제 전환).
-- 계정 생성은 관리자 [회원 관리 > 직원 추가] 서버 API(service role)만 하므로
-- authenticated 용 insert 정책을 아예 만들지 않는다(= 전면 차단).

-- 수정/삭제: 관리자만 (회원 관리 화면의 이름·권한 변경)
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy profiles_delete_admin on public.profiles for delete to authenticated
  using (public.my_role() = 'admin');

-- ── ② profiles.role 허용값 강제 (임의 문자열 역할 차단) ──
-- (기존 데이터에 5가지 외 값이 있으면 이 줄에서 오류가 나며, 그 경우 값을 먼저 정리해야 함)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','designer','field','partner','pending'));

-- ── ③ notices: 전체 허용 폐기 → 역할별 ──
-- 읽기: 직원은 전체, partner는 '사용법'만(화면 정책과 동일), pending 차단
-- 쓰기: 내부 직원(admin/designer/field)만
alter table public.notices enable row level security;
select public._drop_all_policies('notices');

create policy notices_select on public.notices for select to authenticated
  using (public.is_approved() and (public.my_role() <> 'partner' or category = '사용법'));
create policy notices_insert on public.notices for insert to authenticated
  with check (public.my_role() in ('admin','designer','field'));
create policy notices_update on public.notices for update to authenticated
  using (public.my_role() in ('admin','designer','field'))
  with check (public.my_role() in ('admin','designer','field'));
create policy notices_delete on public.notices for delete to authenticated
  using (public.my_role() in ('admin','designer','field'));

-- ── ④ notifications: 클라이언트 임의 생성 차단 ──
-- 알림 생성은 서버(/api/push/send, service role)만 한다. 조회/읽음/삭제(본인 행)는 기존 정책 유지.
drop policy if exists "notif insert any" on public.notifications;

-- ── 확인용: 남아 있는 profiles/notices 정책 목록 ──
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('profiles','notices','notifications')
order by tablename, policyname;
