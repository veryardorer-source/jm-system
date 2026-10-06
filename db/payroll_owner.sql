-- 급여대장 열람자 잠금 (2026-10-06) — 급여대장·급여 기준은 '지정한 계정'만 (관리자 등급이어도 지정 안 되면 못 봄)
-- 대표 결정: 대표·문준호 이사만. 역할(admin)만으로 막으면 나중에 누가 관리자 등급을 받는 순간 보이게 되므로 명단으로 고정.
-- 열람자 추가/해제는 앱에서 불가 — 이 SQL Editor에서만 (payroll_viewers에 쓰기 정책 없음).
-- 운영 DB(이미 payroll.sql 구버전=관리자 전용으로 만든 DB)용 1회 이전 SQL. 재실행 안전.
-- 새 DB는 rls_helpers.sql·payroll.sql·audit_logs.sql에 같은 내용이 들어 있어 이 파일이 필요 없음.

-- ⓪ 수습이 달 중간에 끝날 때 그 날까지만 90% — 지급률 적용 일수 칸
alter table public.payroll_items add column if not exists rate_days int check (rate_days between 0 and 31);

-- ① 열람자 명단 + 확인 함수
create table if not exists public.payroll_viewers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.payroll_viewers enable row level security;
drop policy if exists "self read" on public.payroll_viewers;
create policy "self read" on public.payroll_viewers for select to authenticated using (user_id = auth.uid());
-- insert/update/delete 정책 없음 = 앱에서는 아무도 명단을 못 바꿈

-- 열람자이면서 지금도 관리자 등급인가 (관리자에서 내려가면 자동으로 막힘)
create or replace function public.is_payroll_viewer()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.payroll_viewers where user_id = auth.uid())
            and coalesce(public.my_role() = 'admin', false) $$;

-- ② 열람자 지정: 대표 + 문준호 이사 (대표 결정 2026-10-06)
insert into public.payroll_viewers (user_id, note)
select id, case email when 'veryardorer@naver.com' then '대표' else '이사' end
from auth.users where email in ('veryardorer@naver.com', '4woman1207@naver.com')
on conflict (user_id) do nothing;

-- ③ 급여 표 2개: 관리자 전용 → 열람자 전용
drop policy if exists "admin only" on public.employee_pay_settings;
drop policy if exists "payroll viewer only" on public.employee_pay_settings;
create policy "payroll viewer only" on public.employee_pay_settings for all to authenticated
  using (public.is_payroll_viewer()) with check (public.is_payroll_viewer());

drop policy if exists "admin only" on public.payroll_items;
drop policy if exists "payroll viewer only" on public.payroll_items;
create policy "payroll viewer only" on public.payroll_items for all to authenticated
  using (public.is_payroll_viewer()) with check (public.is_payroll_viewer());

-- ④ 감사 기록에도 급여 변경 전후 금액이 남으므로, 그 줄은 열람자만
-- (audit_logs.sql을 아직 안 돌린 DB면 건너뜀 — 나중에 audit_logs.sql을 돌리면 같은 정책이 들어감)
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    drop policy if exists audit_select_admin on public.audit_logs;
    create policy audit_select_admin on public.audit_logs
      for select to authenticated using (
        public.my_role() = 'admin'
        and (table_name not in ('employee_pay_settings', 'payroll_items') or public.is_payroll_viewer())
      );
  end if;
end $$;

-- 확인: 열람자 명단 (대표·이사 2개만 나와야 함)
select u.email, v.note from public.payroll_viewers v join auth.users u on u.id = v.user_id;
