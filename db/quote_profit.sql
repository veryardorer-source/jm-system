-- 견적서 탭 확장 — 추가공사·고용산재·부가세·순이익 칸 + 연도별 본사 총지출
-- jm-system Supabase SQL Editor에서 1회 실행 (finance_quotes.sql 다음, 재실행 안전)
-- ⚠️ 선행: db/rls_helpers.sql (public.my_role() 함수 필요)
alter table public.finance_quotes add column if not exists extra_amount bigint not null default 0; -- 추가 공사 금액
alter table public.finance_quotes add column if not exists insurance    bigint not null default 0; -- 고용산재 금액
alter table public.finance_quotes add column if not exists vat          bigint not null default 0; -- 부가세
alter table public.finance_quotes add column if not exists net_profit   bigint;                    -- 순이익(손익 엑셀 기준, 비우면 미입력)
-- 손익을 다른 견적서와 합쳐 계산한 경우(A+B 손익표 하나) → B에 A의 id. A의 %는 A+B 공급가 기준
alter table public.finance_quotes add column if not exists merged_into  uuid references public.finance_quotes(id) on delete set null;

-- 연도별 본사 총지출(경리나라 본사 손익 → GPT 분류 합계를 직접 입력)
create table if not exists public.finance_hq_expense (
  year        int primary key,
  amount      bigint not null default 0,
  memo        text,
  updated_at  timestamptz not null default now()
);
-- RLS: 재무 자료 → 관리자 전용
alter table public.finance_hq_expense enable row level security;
drop policy if exists "admin only" on public.finance_hq_expense;
create policy "admin only" on public.finance_hq_expense for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
