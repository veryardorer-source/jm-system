-- 수금 관리(payments) — jm-todolist 앱에서 이전
-- jm-system Supabase(btpgmtuvtkhdifpaynes)에서 1회 실행
-- ⚠️ 선행: db/rls_helpers.sql 먼저 실행 (public.my_role() 함수 필요)

-- 1) 테이블
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete set null,
  project_name text not null,
  type        text not null default '계약금',
  amount      bigint not null default 0,
  due_date    date,
  paid_date   date,
  paid        boolean not null default false,
  note        text,
  created_at  timestamptz not null default now()
);

-- 2) 보안(RLS) — 금전자료: admin/designer/field만 (rls_money.sql 기준. 구버전 전체허용 폐기 — 2026-07-07)
alter table public.payments enable row level security;
drop policy if exists "payments auth all" on public.payments;
drop policy if exists money_staff on public.payments;
create policy money_staff on public.payments for all to authenticated
  using (public.my_role() in ('admin','designer','field'))
  with check (public.my_role() in ('admin','designer','field'));

-- 3) jm-todolist 수금 45건 이전 (payments 비어있을 때만 — 중복방지)
--    현장명이 jm-system 현장과 일치하면 project_id 자동 연결
insert into public.payments (project_id, project_name, type, amount, due_date, paid_date, paid, note)
select pr.id, v.project_name, v.type, v.amount,
       nullif(v.due_date,'')::date, nullif(v.paid_date,'')::date, v.paid, nullif(v.note,'')
from (values
  ('지엔티가구','기타',407000,'','2026-03-31',true,'테이블'),
  ('지엔티가구','기타',143000,'','2026-03-31',true,''),
  ('서경방송 1,8층 디자인','계약금',2650000,'2025-12-17','2026-01-07',true,''),
  ('서경방송 1,8층 디자인','잔금',3080000,'2026-01-16','2026-03-17',true,''),
  ('장유사무실','계약금',9636000,'2026-03-03','2026-03-04',true,''),
  ('현대마린엔진대표실','계약금',10593000,'2026-03-06','2026-03-31',true,''),
  ('장유사무실','중도금',9636000,'2026-03-09','2026-03-10',true,''),
  ('경남테크노파크','잔금',4268000,'2026-03-11','2026-03-20',true,''),
  ('헥사곤 사인물','잔금',36520000,'2026-03-19','2026-03-25',true,''),
  ('반보유보라 교습소','계약금',5880000,'2026-03-19','2026-03-24',true,''),
  ('어반브릭스 컴퓨터학원','계약금',10000000,'2026-03-19','',true,''),
  ('팔용동사진관','계약금',1000000,'2026-03-20','2026-03-30',true,''),
  ('장유사무실','잔금',4818000,'2026-03-21','2026-03-20',true,''),
  ('반보유보라 교습소','중도금',5880000,'2026-03-26','2026-03-26',true,''),
  ('어반브릭스 컴퓨터학원','잔금',5700000,'2026-03-27','2026-03-27',true,''),
  ('지엔피(부산대 바이오소재미수금)','잔금',902000,'2026-03-27','2026-03-25',true,''),
  ('반보유보라 교습소','잔금',2940000,'2026-04-01','2026-04-01',true,''),
  ('롯데캐슬 미용실','계약금',1000000,'2026-04-07','2026-04-07',true,''),
  ('롯데캐슬 교습소','계약금',1000000,'2026-04-07','2026-04-07',true,''),
  ('진해푸른회','계약금',3600000,'2026-04-07','2026-04-15',true,''),
  ('팔용동사진관','중도금',7680000,'2026-04-09','2026-04-09',true,''),
  ('미부덕트','잔금',8500000,'2026-04-10','2026-04-30',true,''),
  ('롯데캐슬 교습소','중도금',5340000,'2026-04-11','2026-04-13',true,''),
  ('진해푸른회','중도금',3600000,'2026-04-14','2026-04-15',true,''),
  ('팔용동사진관','중도금',8680000,'2026-04-15','2026-04-15',true,''),
  ('반보유보라 교습소','기타',330000,'2026-04-17','2026-04-17',true,''),
  ('롯데캐슬 교습소','중도금',6340000,'2026-04-17','2026-04-17',true,''),
  ('진해푸른회','잔금',1800000,'2026-04-21','2026-04-29',true,''),
  ('팔용동사진관','잔금',4340000,'2026-04-25','2026-04-26',true,''),
  ('롯데캐슬 교습소','잔금',3170000,'2026-04-25','2026-04-28',true,''),
  ('미부덕트','기타',924000,'2026-04-27','2026-04-30',true,''),
  ('진해푸른회','기타',1243000,'2026-04-27','2026-04-29',true,''),
  ('현대마린엔진 선주실','잔금',52899000,'2026-04-30','2026-05-15',true,''),
  ('현대마린엔진 접견실','잔금',1991000,'2026-05-23','2026-06-25',true,''),
  ('롯데캐슬 미용실','중도금',8200000,'2026-05-29','2026-05-29',true,''),
  ('지엔티 옷장구매','잔금',1243000,'2026-05-29','2026-06-25',true,''),
  ('린데코리아 사무실','잔금',52789000,'2026-05-31','',false,''),
  ('오늘은 반찬데이','계약금',1000000,'2026-06-01','2026-06-01',true,''),
  ('롯데캐슬 미용실','중도금',9200000,'2026-06-05','2026-06-04',true,''),
  ('오늘은 반찬데이','중도금',14720000,'2026-06-15','2026-06-15',true,''),
  ('롯데캐슬 미용실','잔금',4600000,'2026-06-16','2026-06-15',true,''),
  ('지엔티4공장','계약금',26565000,'2026-06-18','2026-06-25',true,''),
  ('오늘은 반찬데이','중도금',15720000,'2026-07-01','',false,''),
  ('지엔티4공장','잔금',26565000,'2026-07-04','',false,''),
  ('오늘은 반찬데이','잔금',7860000,'2026-07-13','',false,'')
) as v(project_name, type, amount, due_date, paid_date, paid, note)
left join public.projects pr on pr.name = v.project_name
where not exists (select 1 from public.payments);
