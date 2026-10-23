-- 현장 자료 중 계약서·견적서를 잠금 보관함(secure)에 — 주소만 알면 열리던 문제 (2026-10-23)
-- jm-system Supabase SQL Editor에서 1회 실행 (재실행 안전)
-- ⚠️ 선행: db/secure_bucket.sql, db/rls_helpers.sql
--
-- 경로는 공개 저장소와 같은 files/<현장id>/... 를 그대로 쓴다.
-- 열람 범위: 승인 직원(admin/designer/field). 외부협력업체(partner)는 공개 현장이어도 계약서·견적서는 못 봄.

drop policy if exists secure_project_docs_select on storage.objects;
create policy secure_project_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'secure' and name like 'files/%' and public.my_role() in ('admin', 'designer', 'field'));

drop policy if exists secure_project_docs_insert on storage.objects;
create policy secure_project_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'secure' and name like 'files/%' and public.my_role() in ('admin', 'designer', 'field'));

drop policy if exists secure_project_docs_update on storage.objects;
create policy secure_project_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'secure' and name like 'files/%' and public.my_role() in ('admin', 'designer', 'field'))
  with check (bucket_id = 'secure' and name like 'files/%' and public.my_role() in ('admin', 'designer', 'field'));

drop policy if exists secure_project_docs_delete on storage.objects;
create policy secure_project_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'secure' and name like 'files/%' and public.my_role() in ('admin', 'designer', 'field'));
