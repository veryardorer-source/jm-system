-- 공정별 외주업체 + 예약 확정 여부 (2026-10-07)
-- 외주업체를 정해놓고 잊어 다른 업체와 중복 예약하는 일을 막기 위함.
-- 재실행 안전.
alter table public.schedules add column if not exists vendor text;
alter table public.schedules add column if not exists vendor_booked boolean not null default false;
notify pgrst, 'reload schema';
