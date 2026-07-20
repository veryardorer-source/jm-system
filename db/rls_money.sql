-- =============================================================
-- 금전/내부자료 RLS 정비 (2026-07-02) — 우선순위 2
-- receipts / withdrawal_requests / payments / project_costs /
-- company_documents / project_files
-- 기존 auth_all(전체 허용)을 역할 기준으로 교체.
-- ⚠ 운영 데이터 접근 영향 → SQL Editor에서 검토 후 실행. 실행 전 스냅샷 권장.
--
-- 정책 근거(현재 앱 동작과 일치, 기능 안 깨지게):
--   receipts/withdrawals          : admin/designer/field 사용(현장팀이 등록), partner·pending 차단
--   payments(수금)                : **admin 전용** (2026-07-10 대표 확정)
--   project_costs                 : 현장상세 canSeeMoney=(field·partner 제외) → admin/designer
--   company_documents             : admin=전체, 그 외=전체공개만, 쓰기=admin (화면 로직과 동일)
--   project_files                 : 직원=전체 읽기·쓰기 / partner=공개 지정 현장만 읽기(project_access 기준)
--                                   → db/project_access.sql 과 동일 정책. 어느 파일을 나중에 실행해도 결과 동일.
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

-- ── 영수증/출금: admin/designer/field 접근 (현장팀이 등록해야 함), partner·미승인 차단 ──
do $$
declare t text;
begin
  foreach t in array array['receipts','withdrawal_requests'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    perform public._drop_all_policies(t);
    execute format($f$create policy money_staff on public.%I for all to authenticated
      using (public.my_role() in ('admin','designer','field'))
      with check (public.my_role() in ('admin','designer','field'))$f$, t);
  end loop;
end $$;

-- ── 수금(payments): 관리자 전용 — 고객 입금 정보 (2026-07-10 대표 확정) ──
do $$
begin
  if to_regclass('public.payments') is not null then
    alter table public.payments enable row level security;
    perform public._drop_all_policies('payments');
    create policy payments_rw on public.payments for all to authenticated
      using (public.my_role() = 'admin')
      with check (public.my_role() = 'admin');
  end if;
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

-- ── 현장 자료(project_files): 직원=전체 / partner=공개 지정 현장만 (project_access.sql 과 동일 정책) ──
-- 실행 순서와 무관하게 같은 결과가 되도록, 선행 요소(project_access 테이블·함수)를 여기서도 보장한다.
create table if not exists public.project_access (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create or replace function public.has_project_access(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.project_access
                    where project_id = pid and user_id = auth.uid()) $$;

do $$
begin
  if to_regclass('public.project_files') is not null then
    alter table public.project_files enable row level security;
    perform public._drop_all_policies('project_files');
    -- partner는 공개 지정된 현장 자료만 (미지정 현장·pending 차단)
    create policy files_select on public.project_files for select to authenticated
      using (
        public.my_role() in ('admin','designer','field')
        or (public.my_role() = 'partner' and public.has_project_access(project_id))
      );
    create policy files_insert on public.project_files for insert to authenticated
      with check (public.my_role() in ('admin','designer','field'));
    create policy files_update on public.project_files for update to authenticated
      using (public.my_role() in ('admin','designer','field'))
      with check (public.my_role() in ('admin','designer','field'));
    create policy files_delete on public.project_files for delete to authenticated
      using (public.my_role() in ('admin','designer','field'));
  end if;
end $$;
