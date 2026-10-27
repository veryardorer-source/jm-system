-- 견적서 순이익 두 칸 — 기존 net_profit = 부가세 제외(견적서 기준), 새 칸 = 부가세 포함(통장 기준)
-- 실제 순이익 = 부가세 포함 순이익 합 − 본사 총지출(부가세 납부 포함 → 서로 상쇄)
-- jm-system Supabase SQL Editor에서 1회 실행 (quote_profit.sql 다음, 재실행 안전)
alter table public.finance_quotes add column if not exists net_profit_vat bigint; -- 순이익(부가세 포함, 손익 엑셀 기준, 비우면 미입력)
notify pgrst, 'reload schema';
