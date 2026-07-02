-- =============================================================
-- 금전/내부자료 RLS 정비 (2026-07-02) — 우선순위 2
-- receipts / withdrawal_requests / payments / project_costs /
-- company_documents / project_files
-- 기존 auth_all(전체 허용)을 역할 기준으로 교체.
-- ⚠ 운영 데이터 접근 영향 → SQL Editor에서 검토 후 실행. 실행 전 스냅샷 권장.
--
-- 정책 근거(현재 앱 동작과 일치, 기능 안 깨지게):
--   receipts/withdrawals/payments : 화면에서 partner만 차단, admin/designer/field 사용 → 동일 적용
--   project_costs                 : 현장상세 canSeeMoney=(field·partner 제외) → admin/designer
--   company_documents             : admin=전체, 그 외=전체공개만, 쓰기=admin (화면 로직과 동일)
--   project_files                 : 승인자 읽기, partner 보기전용(쓰기 불가)
--   finance_* / employees*        : 이미 rls_sensitive.sql 에서 admin 전용(중복 정의 안 함)
-- =============================================================

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

-- ── 금전자료: admin/designer/field 접근, partner·미승인 차단 ──
do $$
declare t text;
begin
  foreach t in array array['receipts','withdrawal_requests','payments'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    perform public._drop_all_policies(t);
    execute format($f$create policy money_staff on public.%I for all to authenticated
      using (public.my_role() in ('admin','designer','field'))
      with check (public.my_role() in ('admin','designer','field'))$f$, t);
  end loop;
end $$;

-- ── 현장 비용(project_costs): admin/designer 만 (field·partner 제외) ──
do $$
begin
  if to_regclass('public.project_costs') is not null then
    alter table public.project_costs enable row level security;
    perform public._drop_all_policies('project_costs');
    create policy costs_rw on public.project_costs for all to authenticated
      using (public.my_role() in ('admin','designer'))
      with check (public.my_role() in ('admin','designer'));
  end if;
end $$;

-- ── 회사 서류(company_documents) ──
do $$
begin
  if to_regclass('public.company_documents') is not null then
    alter table public.company_documents enable row level security;
    perform public._drop_all_policies('company_documents');
    -- 읽기: admin 전체 / designer·field 는 '전체공개' 문서만 (partner·미승인 차단)
    create policy docs_select on public.company_documents for select to authenticated
      using (
        public.my_role() = 'admin'
        or (public.my_role() in ('designer','field') and visibility = '전체공개')
      );
    -- 쓰기: admin 만
    create policy docs_insert on public.company_documents for insert to authenticated
      with check (public.my_role() = 'admin');
    create policy docs_update on public.company_documents for update to authenticated
      using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
    create policy docs_delete on public.company_documents for delete to authenticated
      using (public.my_role() = 'admin');
  end if;
end $$;

-- ── 현장 자료(project_files): 승인자 읽기, partner 보기전용(쓰기 불가) ──
-- (partner "배정 현장만"은 project_assignments 에 user_id 연결이 없어 보류 → security_status.md 참고)
do $$
begin
  if to_regclass('public.project_files') is not null then
    alter table public.project_files enable row level security;
    perform public._drop_all_policies('project_files');
    create policy files_select on public.project_files for select to authenticated
      using (public.is_approved());
    create policy files_insert on public.project_files for insert to authenticated
      with check (public.my_role() in ('admin','designer','field'));
    create policy files_update on public.project_files for update to authenticated
      using (public.my_role() in ('admin','designer','field'))
      with check (public.my_role() in ('admin','designer','field'));
    create policy files_delete on public.project_files for delete to authenticated
      using (public.my_role() in ('admin','designer','field'));
  end if;
end $$;
