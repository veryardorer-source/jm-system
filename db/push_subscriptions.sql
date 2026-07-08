-- 웹 푸시 구독 저장 — jm-system Supabase에서 1회 실행
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid,
  p256dh      text,
  auth        text,
  created_at  timestamptz not null default now()
);
-- RLS: 본인 구독만 조회/등록/삭제 (발송은 서버 service_role이 RLS 우회. 구버전 전체허용 폐기 — 2026-07-07)
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_sub auth all" on public.push_subscriptions;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
