-- =============================================================
-- 견적 프로그램 M1 (2026-07-02) — Supabase SQL Editor에서 1회 실행
-- estimates: 견적서 (내역은 sections JSONB — M1 단순화, M3에서 통계용 정규화 검토)
-- price_book: 자재 단가표 (품명 자동완성·단가 채움용)
-- 접근: admin/designer만 (field/partner/미승인 차단 — 금액 정보)
-- =============================================================

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create table if not exists public.estimates (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,                 -- 현장명 (예: 이홍렬법률사무소)
  work_name   text,                          -- 공사명 (예: 이홍렬법률사무소 인테리어)
  customer    text,                          -- 수신 (예: 대표님 귀하)
  category    text,                          -- 업종 (학원/교습소, 뷰티/미용, 사무실, 식음료, 주거, 상업/기타)
  area_py     numeric,                       -- 평수
  status      text not null default '작성중', -- 작성중/제출/계약/완료
  est_date    date not null default current_date,
  note        text,                          -- 특기사항
  project_id  uuid references public.projects(id) on delete set null,
  -- sections: [{ name: '목작업', items: [{ name, spec, unit, qty, mat, lab, exp }] }]
  -- mat/lab/exp = 재료비/노무비/경비 "단가" (금액 = 단가 × qty, 앱에서 계산)
  sections    jsonb not null default '[]',
  -- rates: { employ: 0.0101, accident: 0.0356, mgmt: 0.05, profit: 0.10, vat: 0.10, safety_amt: 0 }
  rates       jsonb not null default '{"employ":0.0101,"accident":0.0356,"mgmt":0.05,"profit":0.10,"vat":0.10,"safety_amt":0}',
  nego        bigint not null default 0,     -- 네고 금액 (음수 입력)
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.price_book (
  id          uuid primary key default gen_random_uuid(),
  trade       text,                          -- 공종 (목작업, 전기작업 ...)
  name        text not null,                 -- 품명 (석고보드)
  spec        text,                          -- 규격 (900*1800*9T)
  unit        text,                          -- 단위 (EA, M2, 식, 인 ...)
  mat_price   bigint not null default 0,     -- 재료비 단가
  lab_price   bigint not null default 0,     -- 노무비 단가
  exp_price   bigint not null default 0,     -- 경비 단가
  memo        text,
  updated_at  timestamptz not null default now()
);

alter table public.estimates enable row level security;
alter table public.price_book enable row level security;

drop policy if exists "estimates admin designer" on public.estimates;
create policy "estimates admin designer" on public.estimates
  for all to authenticated
  using (public.my_role() in ('admin','designer'))
  with check (public.my_role() in ('admin','designer'));

drop policy if exists "price_book admin designer" on public.price_book;
create policy "price_book admin designer" on public.price_book
  for all to authenticated
  using (public.my_role() in ('admin','designer'))
  with check (public.my_role() in ('admin','designer'));

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists estimates_touch on public.estimates;
create trigger estimates_touch before update on public.estimates
  for each row execute function public.touch_updated_at();

-- ── 단가표 초기 데이터 (자재단가표 + 기존 견적서 빈출 품목, 비어있을 때만) ──
insert into public.price_book (trade, name, spec, unit, mat_price, lab_price, exp_price)
select * from (values
  ('목작업','각재','2400*28*28','EA',31000,0,0),
  ('목작업','각재','2700*28*28','EA',33000,0,0),
  ('목작업','각재','3000*28*28','EA',35000,0,0),
  ('목작업','각재','3600*28*28','EA',37000,0,0),
  ('목작업','석고보드','900*1800*9T','EA',4300,0,0),
  ('목작업','방화석고보드','900*1800*12.5T','EA',7700,0,0),
  ('목작업','M.D.F','1220*2440*9T','EA',12000,0,0),
  ('목작업','M.D.F','1220*2440*18T','EA',23000,0,0),
  ('목작업','합판','1220*2440*4.6T','EA',9900,0,0),
  ('목작업','합판','1220*2440*8.5T','EA',16000,0,0),
  ('목작업','합판','1220*2440*14.5T','EA',28500,0,0),
  ('목작업','오징어합판','1220*2440*6T','EA',18500,0,0),
  ('목작업','랩핑평판','600*2440*9T','EA',23000,0,0),
  ('목작업','랩핑몰딩','30*2440*9T','EA',2000,0,0),
  ('목작업','랩핑몰딩','60*2440*9T','EA',2600,0,0),
  ('목작업','라인타공판','1184*2400*9T','EA',55000,0,0),
  ('목작업','원형타공판','1200*2400*9T','EA',51500,0,0),
  ('목작업','흡음재','450*1000 / 글라스울','EA',55000,0,0),
  ('목작업','ABS도어','900*2100*110바','SET',280000,0,0),
  ('목작업','ABS타공도어','900*2100*110바','SET',290000,0,0),
  ('목작업','ABS히든도어','900*2100','SET',802000,0,0),
  ('목작업','ABS슬라이딩도어','900*2200','SET',500000,0,0),
  ('목작업','부자재','','식',300000,0,0),
  ('목작업','자재소운반','','식',0,0,500000),
  ('목작업','노무비','','인',0,300000,20000),
  ('전기, 통신작업','전선','HIV 2.5SQ','M',550,0,0),
  ('전기, 통신작업','전선','HIV 1.5SQ','M',400,0,0),
  ('전기, 통신작업','UTP','','M',500,0,0),
  ('전기, 통신작업','난연파이프','16MM','M',350,0,0),
  ('전기, 통신작업','분전함','','EA',400000,0,0),
  ('전기, 통신작업','인건비','','인',0,300000,20000),
  ('조명','조명기구','3인치 매입','EA',4000,0,0),
  ('조명','조명기구','3인 스팟 COB','EA',11000,0,0),
  ('조명','조명기구','T5','M',6000,0,0),
  ('가설작업','먹메김 및 보양','','M2',150,1800,0),
  ('가설작업','현장정리 및 정돈','','M2',350,800,0),
  ('가설작업','준공청소','','M2',1500,4000,600),
  ('가설작업','폐기물처리','','식',0,0,500000),
  ('타일작업','포쉐린타일','600*600','BOX',32000,0,0),
  ('타일작업','압착시멘트','20KG','EA',6000,0,0),
  ('타일작업','에폭시본드','','SET',30000,0,0),
  ('타일작업','노무비','','인',0,300000,20000)
) as v(trade, name, spec, unit, mat_price, lab_price, exp_price)
where not exists (select 1 from public.price_book limit 1);
