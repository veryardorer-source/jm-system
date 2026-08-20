-- =============================================================
-- 잠금 보관함(비공개 버킷) 1단계 — 경영관리 파일 (2026-08-25)
-- Supabase SQL Editor에서 한 번 실행하세요.
--
-- 기존 uploads 버킷은 공개(주소를 알면 누구나 열람)라서,
-- 견적서·매출매입 첨부·손익표 같은 민감 파일은 비공개 버킷 'secure'로 옮긴다.
-- 열람은 관리자가 앱에서 열 때마다 발급되는 1시간짜리 서명 주소로만 가능.
-- =============================================================

-- ① 비공개 버킷 생성 (이미 있으면 비공개로 강제)
insert into storage.buckets (id, name, public)
values ('secure', 'secure', false)
on conflict (id) do update set public = false;

-- ② 접근 정책: secure 버킷은 관리자만 (읽기=서명 주소 발급 포함)
drop policy if exists secure_admin_select on storage.objects;
create policy secure_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'secure' and public.my_role() = 'admin');

drop policy if exists secure_admin_insert on storage.objects;
create policy secure_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'secure' and public.my_role() = 'admin');

drop policy if exists secure_admin_update on storage.objects;
create policy secure_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'secure' and public.my_role() = 'admin')
  with check (bucket_id = 'secure' and public.my_role() = 'admin');

drop policy if exists secure_admin_delete on storage.objects;
create policy secure_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'secure' and public.my_role() = 'admin');

-- 확인
select id, public from storage.buckets where id = 'secure';
