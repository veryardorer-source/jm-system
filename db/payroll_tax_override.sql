-- 2026-11: 퇴사자 원천징수 정산용 소득세/주민세 직접 입력 필드
-- 운영 DB에 적용하기 전 스냅샷을 확인하고 대표 승인을 받는다.
-- 선행: db/payroll.sql (payroll_items 테이블)

-- 소득세/주민세 오버라이드 (null이면 자동 계산, 값이 있으면 그 값 사용)
-- 음수 허용 (퇴사자 연말정산으로 환급 가능)
alter table public.payroll_items
  add column if not exists income_tax_override bigint default null,
  add column if not exists local_tax_override bigint default null;

comment on column public.payroll_items.income_tax_override is '소득세 오버라이드 (null=자동계산, 값=직접입력). 퇴사자 원천징수 정산 시 음수 가능';
comment on column public.payroll_items.local_tax_override is '주민세 오버라이드 (null=자동계산, 값=직접입력). 퇴사자 원천징수 정산 시 음수 가능';
