-- 현장 출입 정보 — 반장님께 '카톡으로 일정 보내기' 할 때 같이 나가는 칸
-- jm-system Supabase(btpgmtuvtkhdifpaynes) SQL Editor에서 1회 실행 (재실행 안전)
-- projects 기존 RLS 정책을 그대로 따른다 (새 정책 없음)

alter table public.projects add column if not exists entry_code text;   -- 공동현관 비밀번호
alter table public.projects add column if not exists door_code  text;   -- 세대(현관) 비밀번호
alter table public.projects add column if not exists site_notes text;   -- 현장 주의사항 (엘리베이터 시간, 주차 등)
