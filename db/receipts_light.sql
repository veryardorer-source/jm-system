-- 영수증(가벼운 버전) — 사진 + 현장·용도 버튼, 대표가 경리나라에 옮긴 건 '정리 완료' 체크 (2026-10-23)
-- jm-system Supabase SQL Editor에서 1회 실행 (재실행 안전)
-- ⚠️ 선행: db/secure_bucket.sql, db/rls_helpers.sql. receipts 표 자체 RLS는 db/rls_money.sql(승인 직원) 그대로

alter table public.receipts add column if not exists category text;   -- 용도: 자재·인건비·식대·장비·공구·유류·교통·기타

-- 영수증 사진은 잠금 보관함 receipts/ 에 — 출금 사진과 같은 범위(승인 직원)
drop policy if exists secure_receipts_select on storage.objects;
create policy secure_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'secure' and name like 'receipts/%' and public.my_role() in ('admin', 'designer', 'field'));

drop policy if exists secure_receipts_insert on storage.objects;
create policy secure_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'secure' and name like 'receipts/%' and public.my_role() in ('admin', 'designer', 'field'));

drop policy if exists secure_receipts_delete on storage.objects;
create policy secure_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'secure' and name like 'receipts/%' and public.my_role() in ('admin', 'designer', 'field'));
