-- 급여대장 자동 생성 (2026-10-06) — 노무사 급여대장 양식을 시스템에서 계산
-- ① employee_pay_settings : 직원별 급여 기준(월지급액·수당·가족수·4대보험 고지액) = 새 달을 만들 때의 기본값
-- ② payroll_items         : 월별 직원 한 줄 — 만들 때 ①을 복사해 두므로, 나중에 연봉이 바뀌어도 지난 달 대장은 그대로
-- 계산식은 앱(src/lib/payroll.ts)에 있음. 이 표에는 입력값만 저장.
-- Supabase SQL Editor에서 한 번 실행하세요. (재실행 안전)
-- ⚠️ 선행: db/rls_helpers.sql (my_role()·payroll_viewers·is_payroll_viewer() 필요)

create table if not exists public.employee_pay_settings (
  employee_id          uuid primary key references public.employees(id) on delete cascade,
  work_type            text not null default '본사',   -- 본사 / 현장 / 본사(계약직) / 현장(계약직)
  position             text,                           -- 직책 (대표·이사·사원 …)
  monthly_pay          bigint not null default 0,      -- 월지급액(세전, 연봉÷12)
  meal                 bigint not null default 0,      -- 식대(비과세)
  car                  bigint not null default 0,      -- 차량유지비(비과세)
  position_allowance   bigint not null default 0,      -- 직책수당
  dependents           int not null default 1 check (dependents between 1 and 11), -- 공제대상가족(본인 포함)
  employment_insurance boolean not null default true,  -- 고용보험 가입 (대표·임원은 미가입)
  health_ins           bigint not null default 0,      -- 건강보험 (공단 고지액)
  care_ins             bigint not null default 0,      -- 장기요양 (공단 고지액)
  pension              bigint not null default 0,      -- 국민연금 (공단 고지액)
  probation_end        date,                           -- 수습 종료일 (이 날이 든 달까지 수습 지급률)
  probation_rate       numeric(4,3) not null default 0.9,
  updated_at           timestamptz not null default now()
);

create table if not exists public.payroll_items (
  id                   uuid primary key default gen_random_uuid(),
  month                text not null check (month ~ '^\d{4}-\d{2}$'),  -- 'YYYY-MM'
  employee_id          uuid references public.employees(id) on delete set null,
  employee_name        text not null,                  -- 직원이 지워져도 대장은 남도록 이름 보관
  sort                 int not null default 0,
  position             text,
  work_type            text not null default '본사',
  monthly_pay          bigint not null default 0,
  meal                 bigint not null default 0,
  car                  bigint not null default 0,
  position_allowance   bigint not null default 0,
  dependents           int not null default 1 check (dependents between 1 and 11),
  employment_insurance boolean not null default true,
  pay_rate             numeric(4,3) not null default 1 check (pay_rate >= 0 and pay_rate <= 1), -- 지급률(수습 0.9)
  rate_days            int check (rate_days between 0 and 31), -- 지급률 적용 일수 (수습이 달 중간에 끝날 때). 비우면 근무일 전부
  rate_note            text,                           -- '수습' 등
  days_worked          int check (days_worked between 0 and 31), -- 중도 입사·퇴사 근무일수 (비우면 한 달 전부)
  extra_ot_hours       numeric(6,2) not null default 0, -- 포괄 외 연장 추가시간 (추가근무 기록에서 불러옴)
  night_hours          numeric(6,2) not null default 0, -- 야간 근무시간
  holiday_hours        numeric(6,2) not null default 0, -- 휴일 근무시간
  small_business       boolean not null default true,  -- 5인 미만 → 추가근무 가산 없음(1배)
  bonus                bigint not null default 0,
  health_ins           bigint not null default 0,
  care_ins             bigint not null default 0,
  pension              bigint not null default 0,
  health_adj           bigint not null default 0,      -- 건강보험 정산 (환급은 음수)
  care_adj             bigint not null default 0,      -- 장기요양 정산
  attendance_deduction bigint not null default 0,      -- 근태 공제 (지각·결근 — 직접 입력)
  attendance_note      text,
  duri                 bigint not null default 0,      -- 두리누리 지원액 (참고 표시, 공제 아님)
  memo                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.payroll_items add column if not exists rate_days int check (rate_days between 0 and 31); -- 2026-10-06 추가(기존 DB용)
alter table public.payroll_items add column if not exists night_hours numeric(6,2) not null default 0;
alter table public.payroll_items add column if not exists holiday_hours numeric(6,2) not null default 0;
alter table public.payroll_items add column if not exists small_business boolean not null default true;
create unique index if not exists payroll_items_month_emp on public.payroll_items (month, employee_id);
create index if not exists payroll_items_month_idx on public.payroll_items (month, sort);

-- RLS: 급여 열람자 전용 (대표·이사만 — 대표 결정. 관리자 등급이어도 명단에 없으면 못 봄)
-- payroll_viewers·is_payroll_viewer()는 rls_helpers.sql에 있음
insert into public.payroll_viewers (user_id, note)
select id, case email when 'veryardorer@naver.com' then '대표' else '이사' end
from auth.users where email in ('veryardorer@naver.com', '4woman1207@naver.com')
on conflict (user_id) do nothing;

alter table public.employee_pay_settings enable row level security;
drop policy if exists "admin only" on public.employee_pay_settings;
drop policy if exists "payroll viewer only" on public.employee_pay_settings;
create policy "payroll viewer only" on public.employee_pay_settings for all to authenticated
  using (public.is_payroll_viewer()) with check (public.is_payroll_viewer());

alter table public.payroll_items enable row level security;
drop policy if exists "admin only" on public.payroll_items;
drop policy if exists "payroll viewer only" on public.payroll_items;
create policy "payroll viewer only" on public.payroll_items for all to authenticated
  using (public.is_payroll_viewer()) with check (public.is_payroll_viewer());

-- 감사 기록 — audit_logs.sql이 적용된 DB에서만 부착
do $$
begin
  if to_regprocedure('public.log_audit()') is not null then
    drop trigger if exists audit_employee_pay_settings on public.employee_pay_settings;
    create trigger audit_employee_pay_settings after insert or update or delete on public.employee_pay_settings
      for each row execute function public.log_audit();
    drop trigger if exists audit_payroll_items on public.payroll_items;
    create trigger audit_payroll_items after insert or update or delete on public.payroll_items
      for each row execute function public.log_audit();
  end if;
end $$;
