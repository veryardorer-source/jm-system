-- =============================================================
-- 협력업체(partner) 현장별 접근 권한 (2026-07-10)
-- 현장마다 공개할 partner 계정을 지정 — 지정 안 된 현장은 DB에서 차단.
-- ⚠️ 선행: db/rls_helpers.sql (my_role, is_approved)
-- ⚠️ 실행 후: partner 계정은 공개 지정된 현장만 보임 (직원들은 변화 없음)
-- =============================================================

-- 1) 현장별 공개 대상 테이블
create table if not exists public.project_access (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- 헬퍼: 이 현장에 접근 권한이 있는가 (security definer — 정책 안에서 사용)
create or replace function public.has_project_access(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.project_access
                    where project_id = pid and user_id = auth.uid()) $$;

-- project_access 자체는 관리자만 편집, 본인 행은 조회 가능
alter table public.project_access enable row level security;
drop policy if exists access_admin on public.project_access;
create policy access_admin on public.project_access for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists access_own on public.project_access;
create policy access_own on public.project_access for select to authenticated
  using (user_id = auth.uid());

-- 2) projects: partner는 공개 지정된 현장만, 쓰기는 직원만
alter table public.projects enable row level security;
drop policy if exists auth_all on public.projects;
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
using (
  public.my_role() in ('admin','designer','field')
  or (public.my_role() = 'partner' and public.has_project_access(id))
);
drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects for insert to authenticated
  with check (public.my_role() in ('admin','designer','field'));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (public.my_role() in ('admin','designer','field'))
  with check (public.my_role() in ('admin','designer','field'));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
  using (public.my_role() in ('admin','designer','field'));

-- 3) project_files: partner는 공개 현장 자료만 (기존 files_select 대체)
drop policy if exists files_select on public.project_files;
create policy files_select on public.project_files for select to authenticated
using (
  public.my_role() in ('admin','designer','field')
  or (public.my_role() = 'partner' and public.has_project_access(project_id))
);

-- 4) schedules(공정): partner는 공개 현장 것만, 쓰기는 직원만
alter table public.schedules enable row level security;
drop policy if exists auth_all on public.schedules;
drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules for select to authenticated
using (
  public.my_role() in ('admin','designer','field')
  or (public.my_role() = 'partner' and public.has_project_access(project_id))
);
drop policy if exists schedules_write on public.schedules;
create policy schedules_write on public.schedules for insert to authenticated
  with check (public.my_role() in ('admin','designer','field'));
drop policy if exists schedules_update on public.schedules;
create policy schedules_update on public.schedules for update to authenticated
  using (public.my_role() in ('admin','designer','field'))
  with check (public.my_role() in ('admin','designer','field'));
drop policy if exists schedules_delete on public.schedules;
create policy schedules_delete on public.schedules for delete to authenticated
  using (public.my_role() in ('admin','designer','field'));

-- 5) project_assignments(담당 배정): partner는 공개 현장 것만
alter table public.project_assignments enable row level security;
drop policy if exists auth_all on public.project_assignments;
drop policy if exists assignments_select on public.project_assignments;
create policy assignments_select on public.project_assignments for select to authenticated
using (
  public.my_role() in ('admin','designer','field')
  or (public.my_role() = 'partner' and public.has_project_access(project_id))
);
drop policy if exists assignments_write on public.project_assignments;
create policy assignments_write on public.project_assignments for insert to authenticated
  with check (public.my_role() in ('admin','designer','field'));
drop policy if exists assignments_update on public.project_assignments;
create policy assignments_update on public.project_assignments for update to authenticated
  using (public.my_role() in ('admin','designer','field'))
  with check (public.my_role() in ('admin','designer','field'));
drop policy if exists assignments_delete on public.project_assignments;
create policy assignments_delete on public.project_assignments for delete to authenticated
  using (public.my_role() in ('admin','designer','field'));
