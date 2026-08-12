-- =============================================================
-- 감사 로그 + 마지막 관리자 보호 (2026-08-13) — Supabase SQL Editor에서 한 번 실행
-- ① audit_logs: 민감 작업의 누가/언제/무엇을(변경 전후) 자동 기록 (DB 트리거 —
--    앱을 거치지 않은 직접 수정까지 잡힘). 일반 사용자는 수정·삭제 불가, 관리자는 조회만.
-- ② 마지막 남은 관리자 계정의 삭제·강등을 DB 레벨에서 차단.
-- 몇 번을 다시 실행해도 안전(멱등).
-- =============================================================

-- ── ① 감사 로그 테이블 ──
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  user_name  text,
  table_name text not null,
  action     text not null,          -- INSERT / UPDATE / DELETE
  row_id     text,
  old_data   jsonb,
  new_data   jsonb
);
create index if not exists idx_audit_at on public.audit_logs (at desc);

alter table public.audit_logs enable row level security;
drop policy if exists audit_select_admin on public.audit_logs;
create policy audit_select_admin on public.audit_logs
  for select to authenticated using (public.my_role() = 'admin');
-- insert/update/delete 정책 없음 = 클라이언트에서는 그 무엇도 불가(관리자 포함).
-- 기록은 아래 트리거(security definer)가만 한다.

-- ── 기록 함수 ──
create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  uname text;
begin
  select name into uname from public.profiles where id = uid;
  insert into public.audit_logs (user_id, user_name, table_name, action, row_id, old_data, new_data)
  values (
    uid,
    coalesce(uname, case when uid is null then '서버(service)' else '알 수 없음' end),
    TG_TABLE_NAME,
    TG_OP,
    coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- ── 대상 테이블에 트리거 부착 ──
-- 회원(역할 변경·삭제) / 직원정보·급여·근태 / 급여대장 / 현장 비용 / 출금 처리 /
-- 수금 / 회사 서류·현장 자료 삭제 / 현장 접근권한
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('profiles',              'UPDATE OR DELETE'),
      ('employees',             'INSERT OR UPDATE OR DELETE'),
      ('employee_salaries',     'INSERT OR UPDATE OR DELETE'),
      ('employee_attendance',   'INSERT OR UPDATE OR DELETE'),
      ('finance_payroll',       'INSERT OR UPDATE OR DELETE'),
      ('finance_payroll_ledger','INSERT OR UPDATE OR DELETE'),
      ('project_costs',         'INSERT OR UPDATE OR DELETE'),
      ('withdrawal_requests',   'UPDATE OR DELETE'),
      ('payments',              'INSERT OR UPDATE OR DELETE'),
      ('company_documents',     'DELETE'),
      ('project_files',         'DELETE'),
      ('project_access',        'INSERT OR DELETE')
    ) as t(tbl, ops)
  loop
    if to_regclass('public.' || spec.tbl) is null then continue; end if;
    execute format('drop trigger if exists audit_%I on public.%I', spec.tbl, spec.tbl);
    execute format('create trigger audit_%I after %s on public.%I for each row execute function public.log_audit()',
                   spec.tbl, spec.ops, spec.tbl);
  end loop;
end $$;

-- ── ② 마지막 관리자 보호 ──
create or replace function public.guard_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (TG_OP = 'DELETE' or new.role is distinct from 'admin') then
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception '마지막 관리자 계정은 삭제하거나 권한을 낮출 수 없습니다';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists guard_last_admin on public.profiles;
create trigger guard_last_admin before update or delete on public.profiles
  for each row execute function public.guard_last_admin();

-- 확인
select '감사 트리거 ' || count(*) || '개 설치됨' as 결과
from pg_trigger where tgname like 'audit_%' and not tgisinternal;
