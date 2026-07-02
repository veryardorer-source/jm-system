-- 알림(notifications) 보안: 본인 알림만 읽기/수정/삭제. 단, 남에게 알림 생성(insert)은 로그인 사용자 허용(알림 기능 유지).
alter table public.notifications enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='notifications' loop
    execute format('drop policy if exists %I on public.notifications', p.policyname);
  end loop;
end $$;
create policy "notif select own"  on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif update own"  on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "notif delete own"  on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy "notif insert any"  on public.notifications for insert to authenticated with check (true);
