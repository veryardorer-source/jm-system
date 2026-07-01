-- 웹 푸시 구독 저장 — jm-system Supabase에서 1회 실행
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid,
  p256dh      text,
  auth        text,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_sub auth all" on public.push_subscriptions;
create policy "push_sub auth all" on public.push_subscriptions
  for all to authenticated using (true) with check (true);
