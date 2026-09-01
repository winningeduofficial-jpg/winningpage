-- 이용 요금 구조 최종본(20260806) 반영 — 목표관리 가격 인하 + 상품명 표기 통일.
-- 가격: 목표관리 기준가 30,000 → 25,000 (3개월 10%↓ 67,500 / 6개월 20%↓ 120,000 / 12개월 40%↓ 180,000).
-- 상품명: 시트의 '월 서비스'·'장기이용권' 명칭을 기존 "[스펙] 위닝 서비스명" 패턴에 맞춰 반영.
-- id(UUID)는 환경마다 달라 service_key + duration_months 로 매칭한다.
-- 콜멘토(50,000)·수행평가 1회권(3,500)은 최종본과 일치해 변경 없음.

-- list_price(취소선 정가)도 새 기준가(25,000×개월)로 재계산한다. 1개월은 정가 판매라
-- list_price = price — UI(ServicePricingSection)는 listPrice > price 일 때만 취소선을 그린다.
update public.products
set name = '[월 서비스] 위닝 목표관리', price = 25000, list_price = 25000
where service_key = 'goal' and duration_months = 1;

update public.products
set name = '[3개월 장기이용권] 위닝 목표관리', price = 67500, list_price = 75000
where service_key = 'goal' and duration_months = 3;

update public.products
set name = '[6개월 장기이용권] 위닝 목표관리', price = 120000, list_price = 150000
where service_key = 'goal' and duration_months = 6;

update public.products
set name = '[12개월 장기이용권] 위닝 목표관리', price = 180000, list_price = 300000
where service_key = 'goal' and duration_months = 12;

update public.products
set name = '[월 서비스 2회] 위닝 수행평가'
where service_key = 'suhaeng' and duration_months = 1;

update public.products
set name = '[3개월 6회 장기이용권] 위닝 수행평가'
where service_key = 'suhaeng' and duration_months = 3;

update public.products
set name = '[6개월 14회 장기이용권] 위닝 수행평가'
where service_key = 'suhaeng' and duration_months = 6;

update public.products
set name = '[12개월 30회 장기이용권] 위닝 수행평가'
where service_key = 'suhaeng' and duration_months = 12;

-- 학습진단 이용권 재도입(최종본 20260806) — 종전 "학습진단은 무료라 결제 플로우 제외"
-- 정책(PricingSelling.tsx 주석 참고)을 뒤집는 사용자 확정. 회원가입 시 1회 무료,
-- 이후 결제 필요. 과거 diagnose 행(sql/53 기록, service_sort_order 99)은 삭제된 상태라
-- 신규 insert 하되, 시트 순서(학습진단이 첫 줄)에 맞춰 service_sort_order 0 으로 둔다.
-- 재실행 안전을 위해 slug 충돌 시 건너뛴다.
insert into public.products
  (service_key, service_name, service_sort_order, sort_order, name, slug, program_key,
   price, list_price, session_quota, badge, is_active, service_desc)
select
  'diagnose', '위닝 학습진단', 0, 1, '[이용권] 위닝 학습진단', 'diagnose-1', 'diagnose',
  10000, 10000, 1, '회원가입 시 1회 무료', true,
  '학습진단 서비스는 학생의 학습 습관과 성향을 설문으로 진단해 리포트로 제공하는 서비스입니다. 회원가입 시 1회 무료로 이용할 수 있으며, 이후에는 이용권 결제 후 이용할 수 있습니다.'
where not exists (select 1 from public.products where slug = 'diagnose-1')
  -- ⚠️ 2026-08-22 추가 — programs 에 'diagnose' 가 있을 때만 넣는다.
  --   baseline 은 스키마 전용(INSERT 0건)이라 갓 만든 로컬 DB 에서는 programs 가
  --   비어 있고, products_program_key_fkey 가 이 INSERT 를 23503 으로 막아
  --   `supabase db reset` 전체가 중단됐다(= db-migrations-ci 의 rehearse-migrations
  --   도 supabase/ 를 건드리는 모든 PR 에서 실패한다).
  --
  --   programs 행을 여기서 만들어 채우지 않는 이유: programs·products 는 둘 다
  --   scripts/seed-from-dev.mjs 의 TABLES 에 있어 dev 에서 통째로 주입된다. 이
  --   마이그레이션이 임의 uuid 로 diagnose 행을 만들어두면 그 시드가 upsert
  --   (onConflict: 'id') 할 때 dev 의 diagnose 행과 id 가 달라 program_key
  --   유니크 제약에 걸린다. 로컬에서는 이 상품 행도 어차피 시드가 가져오므로
  --   건너뛰는 것이 맞다.
  --
  --   dev·prod 에는 이미 적용된 마이그레이션이라 이 가드는 영향이 없다
  --   (programs 에 diagnose 가 있고, slug 중복으로 이미 no-op 이다).
  and exists (select 1 from public.programs where program_key = 'diagnose');

-- 쿠폰 최종본 반영 — 회원가입 축하 쿠폰은 9월 30일까지, 8만원 기준 쿠폰은
-- 10만원 이상 결제 시 5,000원 할인으로 조정(slug 도 의미에 맞게 갱신).
update public.coupons
set valid_until = '2026-09-30'
where slug = 'signup-2000';

update public.coupons
set slug = 'over100k-5000', title = '10만원 이상 결제 시 5,000원 할인', min_amount = 100000
where slug = 'over80k-5000';

update public.coupons
set title = '4만원 이상 결제 시 3,000원 할인'
where slug = 'over40k-3000';
