-- 사무실 일정(office_events) — 대시보드 '이번주 일정' 아래 칸 (상담·방문·연차·회의 등 현장 공정이 아닌 일정)
-- jm-system Supabase(btpgmtuvtkhdifpaynes) SQL Editor에서 1회 실행 (재실행 안전)
-- ⚠️ 선행: db/rls_helpers.sql (public.my_role(), public.is_approved())

create table if not exists public.office_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  kind        text not null default '기타',   -- 상담 / 방문 / 연차 / 반차 / 회의 / 기타
  event_date  date not null,
  end_date    date,
  person      text,                            -- 누구 일정인지 (연차자, 방문 담당 등)
  project_id  uuid references public.projects(id) on delete set null,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists office_events_date_idx on public.office_events (event_date);

-- 보안(RLS) — 승인된 실무 직원(admin/designer/field)만 읽기·쓰기, partner·미승인 차단
alter table public.office_events enable row level security;
drop policy if exists office_events_rw on public.office_events;
create policy office_events_rw on public.office_events for all to authenticated
  using (public.my_role() in ('admin', 'designer', 'field'))
  with check (public.my_role() in ('admin', 'designer', 'field'));
