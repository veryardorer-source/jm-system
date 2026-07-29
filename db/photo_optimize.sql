-- 사진 저장 최적화 (2026-07-29)
-- ① project_files에 썸네일 주소·파일 용량·중복 방지 지문 컬럼 추가
-- ② 관리자용 전체 Storage 사용량 조회 함수
-- Supabase SQL Editor에서 전체를 한 번에 실행하면 됩니다.

alter table project_files add column if not exists thumb_url text;
alter table project_files add column if not exists file_size bigint;
alter table project_files add column if not exists file_hash text;

-- 같은 현장에 같은 사진이 있는지 빠르게 확인
create index if not exists idx_project_files_hash on project_files (project_id, file_hash);

-- 전체 Storage 사용량(바이트) — 관리자만 값이 나오고, 그 외에는 null
create or replace function storage_total_bytes()
returns bigint
language sql
security definer
set search_path = public, storage
as $$
  select case when my_role() = 'admin'
    then (select coalesce(sum((metadata->>'size')::bigint), 0)
          from storage.objects where bucket_id = 'uploads')
    else null end;
$$;

revoke all on function storage_total_bytes() from public;
grant execute on function storage_total_bytes() to authenticated;
