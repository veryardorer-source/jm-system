-- 출금 요청 사진을 잠금 보관함(secure)에 — 신분증·통장 사본이 섞여 있어 공개 저장소에서 옮김 (2026-10-23)
-- jm-system Supabase SQL Editor에서 1회 실행 (재실행 안전)
-- ⚠️ 선행: db/secure_bucket.sql (secure 버킷 + 관리자 정책), db/rls_helpers.sql (public.my_role())
--
-- 열람 범위 = 지금 출금 요청을 보는 사람과 같게: 승인된 직원(admin/designer/field).
-- 외부협력업체(partner)·미승인·비로그인은 못 봄. 경영관리 등 다른 secure 파일은 기존대로 관리자만.

drop policy if exists secure_withdrawals_select on storage.objects;
create policy secure_withdrawals_select on storage.objects for select to authenticated
  using (bucket_id = 'secure' and name like 'withdrawals/%' and public.my_role() in ('admin', 'designer', 'field'));

drop policy if exists secure_withdrawals_insert on storage.objects;
create policy secure_withdrawals_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'secure' and name like 'withdrawals/%' and public.my_role() in ('admin', 'designer', 'field'));

drop policy if exists secure_withdrawals_update on storage.objects;
create policy secure_withdrawals_update on storage.objects for update to authenticated
  using (bucket_id = 'secure' and name like 'withdrawals/%' and public.my_role() in ('admin', 'designer', 'field'))
  with check (bucket_id = 'secure' and name like 'withdrawals/%' and public.my_role() in ('admin', 'designer', 'field'));

drop policy if exists secure_withdrawals_delete on storage.objects;
create policy secure_withdrawals_delete on storage.objects for delete to authenticated
  using (bucket_id = 'secure' and name like 'withdrawals/%' and public.my_role() in ('admin', 'designer', 'field'));
