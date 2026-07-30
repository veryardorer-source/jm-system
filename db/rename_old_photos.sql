-- 예전 사진 파일명 일괄 정리 (2026-07-30)
-- 폰 공유로 이름이 image.jpg 등으로 바뀌어 올라온 옛 사진·동영상에
-- 올린 날짜(한국시간)를 앞에 붙여 NAS 등에서 날짜순 정렬이 되게 한다.
-- 예) image.jpg → 20260615_image.jpg
-- · 이름에 이미 날짜(20260615 / 2026-06-15 등)가 있으면 그대로 둠
-- · 사진·동영상만 대상 (도면·PDF·엑셀·링크·글 메모는 제목 유지)
-- · 다시 실행해도 이중으로 붙지 않음(날짜가 생겼으므로 제외됨)

update project_files
set file_name = to_char(created_at at time zone 'Asia/Seoul', 'YYYYMMDD') || '_' || file_name
where coalesce(file_name, '') <> ''
  and file_name !~ '20\d{2}[._-]?(0[1-9]|1[0-2])[._-]?(0[1-9]|[12]\d|3[01])'
  and (
    file_type like 'image/%' or file_type like 'video/%'
    or file_name ~* '\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|mp4|mov|webm|m4v)$'
  );

-- 몇 건 바뀌었는지 확인용 (실행 후 결과 창의 "Rows updated" 숫자로도 확인 가능)
select count(*) as "날짜 이름이 아직 없는 사진(0이어야 정상)"
from project_files
where coalesce(file_name, '') <> ''
  and file_name !~ '20\d{2}[._-]?(0[1-9]|1[0-2])[._-]?(0[1-9]|[12]\d|3[01])'
  and (
    file_type like 'image/%' or file_type like 'video/%'
    or file_name ~* '\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|mp4|mov|webm|m4v)$'
  );
