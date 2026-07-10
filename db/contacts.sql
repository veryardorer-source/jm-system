-- 거래처 연락처 공유 — jm-system Supabase에서 1회 실행
-- ⚠️ 선행: db/rls_helpers.sql 먼저 실행 (public.my_role() 함수 필요)

create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  company    text not null,          -- 업체명
  category   text default '',       -- 분야 (목공/전기/설비/타일...)
  person     text default '',       -- 담당자
  phone      text default '',       -- 전화번호
  memo       text default '',
  created_by text default '',
  created_at timestamptz not null default now()
);

-- RLS: 내부 직원(admin/designer/field)만 — 거래처 정보는 내부 자료, partner·pending 차단
alter table public.contacts enable row level security;
drop policy if exists contacts_staff on public.contacts;
create policy contacts_staff on public.contacts for all to authenticated
  using (public.my_role() in ('admin','designer','field'))
  with check (public.my_role() in ('admin','designer','field'));
