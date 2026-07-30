-- 예전 사진 파일명 정리 2차 (2026-07-30)
-- 정렬은 이름 '맨 앞' 글자로 되므로, KakaoTalk_20260615_… / Resized_20260701_… 처럼
-- 날짜가 이름 속에 있는 사진은 그 날짜를 맨 앞으로 끌어온다.
-- 예) KakaoTalk_20260615_12370.jpg → 20260615_KakaoTalk_20260615_12370.jpg
-- · 이미 날짜로 시작하는 이름은 그대로 둠 (다시 실행해도 안전)
-- · 사진·동영상만 대상

update project_files
set file_name = regexp_replace(
      substring(file_name from '20\d{2}[._-]?(?:0[1-9]|1[0-2])[._-]?(?:0[1-9]|[12]\d|3[01])'),
      '[._-]', '', 'g'
    ) || '_' || file_name
where coalesce(file_name, '') <> ''
  and file_name ~ '20\d{2}[._-]?(0[1-9]|1[0-2])[._-]?(0[1-9]|[12]\d|3[01])'
  and file_name !~ '^20\d{2}[._-]?(0[1-9]|1[0-2])[._-]?(0[1-9]|[12]\d|3[01])'
  and (
    file_type like 'image/%' or file_type like 'video/%'
    or file_name ~* '\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|mp4|mov|webm|m4v)$'
  );

-- 확인: 0이어야 정상 (날짜로 시작하지 않는 사진·동영상 수)
select count(*) as "날짜로 시작하지 않는 사진(0이어야 정상)"
from project_files
where coalesce(file_name, '') <> ''
  and file_name !~ '^20\d{2}[._-]?(0[1-9]|1[0-2])[._-]?(0[1-9]|[12]\d|3[01])'
  and (
    file_type like 'image/%' or file_type like 'video/%'
    or file_name ~* '\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|mp4|mov|webm|m4v)$'
  );
