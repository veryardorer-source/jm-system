-- 민감 테이블 DB 레벨 보안(RLS) — 관리자(admin)만 접근. 관리자 전용 화면에서만 쓰는 테이블이라 앱 동작 영향 없음.
-- 요청 사용자의 역할을 반환하는 헬퍼(보안 정의자)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

do $$
declare
  t text;
  p record;
  tables text[] := array[
    'employees','employee_salaries','employee_attendance',
    'finance_fixed_costs','finance_payroll','finance_project_profit','finance_sales','finance_quotes'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    -- 기존 정책 전부 제거
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    -- 관리자만 전체 권한
    execute format($f$create policy "admin only" on public.%I for all to authenticated using (public.my_role()='admin') with check (public.my_role()='admin')$f$, t);
  end loop;
end $$;
