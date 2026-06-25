-- =============================================================
-- 2026-06-22 적용됨 (Supabase SQL Editor에서 직접 실행)
-- ① 보안: 전체 public 테이블 RLS 활성화 + authenticated 만 허용 (anon 차단)
-- ② 채팅/알림 테이블 + 실시간(realtime)
-- 데이터 클라이언트는 createBrowserClient(쿠키 세션) 이므로 로그인 사용자로 요청됨.
-- =============================================================

-- ① 기존 15개 테이블 RLS ON + 정책
do $$
declare t text;
begin
  foreach t in array array[
    'company_documents','employees','finance_fixed_costs','finance_payroll',
    'finance_project_profit','finance_sales','notices','profiles',
    'project_assignments','project_costs','project_files','projects',
    'receipts','schedules','withdrawal_requests'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists auth_all on public.%I;', t);
    execute format('create policy auth_all on public.%I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ② 채팅(messages)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete set null,
  sender_name text,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
drop policy if exists auth_all on public.messages;
create policy auth_all on public.messages for all to authenticated using (true) with check (true);

-- ② 알림(notifications)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, is_read);
alter table public.notifications enable row level security;
drop policy if exists auth_all on public.notifications;
create policy auth_all on public.notifications for all to authenticated using (true) with check (true);

-- ② 실시간 발행(publication)
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;

-- 참고(향후): 역할별 세부 제한(현장팀은 employees 주민번호/계좌·finance_* 차단 등)은
--           authenticated 단일 정책을 role 기반으로 세분화하여 적용 예정.
