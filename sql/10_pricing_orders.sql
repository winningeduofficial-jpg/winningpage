-- =====================================================================
-- 위닝에듀 결제 상품/주문 스키마 (products / coupons / orders / order_items)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) products : 결제 상품 카탈로그
-- ---------------------------------------------------------------------
-- id/slug 분리 — sql/56_surrogate_uuid_keys.sql 참고.
--   원래 id 는 'goal-1m' 같은 사람이 읽는 text 였다. 의미를 담은 키는 의미가
--   바뀔 때 같이 바꿔야 하고(FK 마이그레이션), 그래서 아무도 안 바꿔서
--   'susi-30' 이 실제 3회권을 가리키는 거짓말이 방치됐다. 지금은 값이 바뀌어도
--   흔들리지 않는 대체키(uuid)와 사람이 읽는 핸들(slug)이 분리돼 있다.
--   이미 이 파일이 적용된 DB(전환 전 text id)에는 이 CREATE 가 no-op 이므로
--   실제 전환은 sql/56 이 ALTER 로 수행한다 — 이 리터럴은 빈 DB 경로에서만
--   쓰인다(두 경로의 최종 형태가 같아야 한다: 타입·제약 이름까지).
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),  -- 대체키(무의미)
  slug               text not null unique,      -- 사람이 읽는 안정 자연키. 예: 'goal-1m'
                                                -- 아래 시드의 `on conflict` 대상이자 어드민 핸들.
  service_key        text not null,             -- 서비스 그룹 키: goal/susi/mentor/suhaeng
  service_name       text not null,             -- 서비스 표시명
  service_desc       text,                      -- 서비스 설명
  service_sort_order int  not null default 99,  -- 서비스 노출 순서
  sort_order         int  not null default 99,  -- 서비스 내 상품 순서
  name               text not null,             -- 상품 표시명 (예: '[1개월] 위닝 목표관리')
  list_price         int  not null,             -- 정가(할인 전)
  price              int  not null,             -- 실제 결제가(할인 후)
  badge              text,                      -- 할인 라벨 (예: '10% 할인'), 없으면 null
  is_recommended     boolean not null default false,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create index if not exists products_active_idx on public.products (is_active, service_sort_order, sort_order);

-- ---------------------------------------------------------------------
-- 2) coupons : 할인 쿠폰
-- ---------------------------------------------------------------------
-- products 와 같은 id/slug 분리(sql/56_surrogate_uuid_keys.sql).
-- slug 는 code 와 다른 것이다: slug 는 시드·어드민이 쿠폰을 지목하는 내부
-- 핸들이고(항상 존재), code 는 고객이 입력하는 공개 코드다(없으면 null,
-- fn_coupon_by_code 만 입력으로 받고 절대 반환하지 않는다 — sql/55 P1-1).
create table if not exists public.coupons (
  id              uuid primary key default gen_random_uuid(),  -- 대체키(무의미)
  slug            text not null unique,         -- 사람이 읽는 안정 자연키. 예: 'signup-2000'
  code            text unique,                  -- 수동 입력용 코드 (없으면 null)
  title           text not null,
  discount_amount int  not null,                -- 정액 할인
  min_amount      int  not null default 0,      -- 최소 결제금액 조건
  valid_until     date,                         -- 유효기간
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) orders : 주문 (헤더)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id              text primary key,             -- 토스 orderId (서버 생성)
  user_id         uuid references auth.users (id) on delete set null,
  -- pending | paid | waiting_deposit | failed | canceled
  --   waiting_deposit : 가상계좌 계좌 발급 완료 + 입금 전(토스 WAITING_FOR_DEPOSIT).
  --                     api/confirm-payment.js 가 기록하고 api/toss-webhook.js 가 paid 로 전이시킨다.
  --   canceled        : 취소/부분취소/입금기한 만료(api/toss-webhook.js).
  status          text not null default 'pending',
  order_name      text,
  list_amount     int  not null default 0,      -- 정가 합계
  discount_amount int  not null default 0,      -- 총 할인
  amount          int  not null,                -- 실제 결제 금액 (신뢰값)
  -- 대표 쿠폰 1개(참고용). 정본은 coupon_redemptions 다 — sql/55_coupon_policy.sql
  -- 상단 "orders.coupon_id 처리" 절 참고. 삭제 규칙은 sql/55 1-c)절이 RESTRICT 로
  -- 덮고, 타입은 uuid(sql/56_surrogate_uuid_keys.sql 전환)다.
  coupon_id       uuid references public.coupons (id) on delete set null,
  customer_email  text,
  payment_key     text,
  method          text,
  paid_at         timestamptz,
  raw             jsonb,                         -- 토스 승인 응답 원본
  created_at      timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status);

-- ---------------------------------------------------------------------
-- 4) order_items : 주문 상세 (라인 아이템)
-- ---------------------------------------------------------------------
create table if not exists public.order_items (
  id            bigint generated always as identity primary key,
  order_id      text not null references public.orders (id) on delete cascade,
  -- product_id(관계) / product_slug(스냅샷) 분리 — sql/56_surrogate_uuid_keys.sql
  -- 3)절. 애초 이 컬럼은 "product_id 에 products.slug 를 text 로 담고 FK 는
  -- 걸지 않는다"였으나, 실제로는 카탈로그 조인(현재가·상태 조회)이 필요해져
  -- 관계와 스냅샷을 분리했다.
  --   product_id   : products.id(uuid) 를 참조하는 FK. on delete set null —
  --                  restrict 로 걸면 한 번이라도 팔린 상품을 영구히 삭제할 수
  --                  없어 어드민이 soft-delete 만 쓸 수 있게 된다.
  --   product_slug : 구매 시점 상품 식별자 스냅샷(products.slug). FK 없음, 값
  --                  불변 — 상품이 단종·개명·가격 개편되거나 product_id 가
  --                  set null 로 비어도, 6개월 뒤 정산·환불 대응에서 "무엇을
  --                  샀는가"를 사람이 읽을 수 있어야 한다.
  -- 두 값은 api/create-order.js 가 products 조회 결과로 채워 sql/55
  -- fn_redeem_coupons 의 p_items 로 함께 실어 보낸다.
  product_id    uuid references public.products (id) on delete set null,
  product_slug  text,
  service_key   text,
  name          text not null,
  list_price    int  not null default 0,
  price         int  not null default 0,
  quantity      int  not null default 1,
  created_at    timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);

-- =====================================================================
-- RLS (Row Level Security)
-- =====================================================================
alter table public.products    enable row level security;
alter table public.coupons     enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- products / coupons : 활성 항목은 누구나 조회 가능 (카탈로그)
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products
  for select using (is_active = true);

drop policy if exists "coupons public read" on public.coupons;
create policy "coupons public read" on public.coupons
  for select using (is_active = true);

-- orders / order_items : 본인 주문만 조회 가능. 생성/수정은 서버(service_role)만.
-- (service_role 키는 RLS 를 우회하므로 별도 insert/update 정책 불필요)
drop policy if exists "orders select own" on public.orders;
create policy "orders select own" on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists "order_items select own" on public.order_items;
create policy "order_items select own" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

-- =====================================================================
-- 시드 데이터 (상품 / 쿠폰)
-- ※ on conflict (slug) do nothing: 최초 설치(신규 slug)만 반영되고, 이미
--    존재하는 상품/쿠폰은 재실행 시 건드리지 않는다. api/create-order.js가
--    products를 결제 신뢰값으로 읽으므로, 이미 저장된 price/is_active(단종·종료
--    처리 포함)를 이 파일 재실행으로 되돌리면 실제 청구 금액·판매 상태가 임의로
--    바뀐다. 가격/카피를 바꾸려면 Supabase에서 해당 행을 직접 update하거나 새
--    slug로 행을 추가하세요(예: 'goal-1m' 가격 개편 시 'goal-1m-v2' 신설).
--
-- ※ 충돌 대상이 id → slug 로 바뀐 이유 (sql/56_surrogate_uuid_keys.sql)
--    id 는 uuid + default gen_random_uuid() 다. 시드가 id 리터럴을 쓸 수 없고
--    (삽입 시점 생성이라 재실행마다 새 uuid = 중복 행), 충돌 판정에 쓸 안정
--    자연키가 필요하다 — 그게 slug 다. 즉 이 파일의 멱등성은 slug 유니크
--    제약에 걸려 있다.
--
-- ※ slug 두 건은 구 text id 와 다르다 (전환 시 실제 값에 맞춰 정정, 사용자 확정)
--      products : 'susi-30'     → slug 'susi-3'       (실제 3회권)
--      coupons  : 'signup-6000' → slug 'signup-2000'  (실제 할인액 2,000원)
--    나머지 15건은 구 id 를 slug 로 그대로 옮겼다. 아래 susi-3 행의 name 이
--    아직 '[12개월 30회 이용권]' 인 것은 실수가 아니다 — 라벨 정정은
--    sql/53_pricing_susi_restore.sql 1-c)가 "구 값에만 적중" 규약으로 수행하고,
--    여기서 미리 고치면 그 문장이 빈 DB 경로에서 0행이 되어 정정 이력이
--    코드에서 사라진다(체인을 끊지 않는다).
--
-- ⚠️ 2026-08-11: 시드 값을 dev(gjowqdiopinhixfivnkx) 실측값으로 갱신했다.
--    이 파일이 처음 작성된 뒤 운영자가 Supabase에서 직접 가격/쿠폰을 조정해왔고
--    (goal/suhaeng 가격 인하, goal-12m 배지 30%→40%, signup-6000 할인액·만료일
--    변경, over200k-5000 쿠폰을 over40k-3000/over80k-5000으로 교체, diagnose-1
--    상품 직접 추가 — 이 상품은 이전까지 이 파일 어디에도 없었다), 사용자가
--    2026-08-11에 "dev 현재 가격이 신가격 정본"이라고 확정했다. 그런데 이
--    INSERT는 위 주석대로 `on conflict do nothing`으로만 가드돼 있어 marker
--    가드(53번 파일 방식)와 달리 값 자체에는 아무 조건이 없다 — 즉 값을 여기서
--    고쳐도 slug가 이미 존재하는 dev/운영 DB에는 영향이 없고(재실행 시 그대로
--    스킵), 오직 앞으로 이 파일로 새로 만들어질 빈 DB에만 새 값이 들어간다.
--    그래서 과거 이력을 왜곡하지 않고 이 INSERT 리터럴을 직접 고치는 쪽을
--    택했다(53_pricing_susi_restore.sql처럼 marker 가드 UPDATE를 새 번호
--    파일로 추가하는 방식은, 이 파일엔 marker가 없어 오히려 불필요하다).
--    과거 시드값(30000/81000/144000/252000, suhaeng 4900~108000, 배지
--    30% 할인, over200k-5000, signup-6000 6000원/2026-08-15 등)은
--    sql/53_pricing_susi_restore.sql 주석과 git 이력에 남아 있다.
--
-- ⚠️ 2026-08-11 (2차): 고객사 확정 최종 가격표에 맞춰 다시 갱신했다(sql/63_
--    pricing_final_alignment.sql이 이미 존재하는 dev/운영 DB에 UPDATE/DELETE로
--    반영 — 이 파일의 리터럴 수정은 앞으로 새로 만들어질 빈 DB 경로용이다,
--    위 문단과 동일한 이유). 변경 내용:
--      · goal 4종: list_price/price 인상(25,000→30,000 / 75,000→90,000,
--        67,500→81,000 / 150,000→180,000,120,000→144,000 /
--        300,000→360,000,180,000→216,000) + name에 "이용권" 추가
--      · mentor-1: name '[이용권] 콜멘토' → '[30분 이용권] 콜멘토' (가격 불변)
--      · suhaeng 5종: "위닝 AI수행평가" → "위닝 수행평가"(name/service_name/
--        service_desc에서 "AI" 제거, 사용자 지시 — 화면에 보이는 모든 "AI"를
--        뺀다). 가격은 이미 최종본과 동일해 불변.
--      · susi 3종·diagnose-1 행 자체를 이 INSERT에서 제거했다 — 고객사
--        요금표·최종본에 susi가 없고, diagnose(학습진단)는 무료 서비스라
--        유료 상품 목록에 있으면 안 된다(sql/63 0)절 근거). susi가 빈 DB
--        경로에서도 더 이상 생기지 않으므로 sql/53_pricing_susi_restore.sql
--        1-a insert는 이제 신규 DB에서도 실제로 신규 삽입을 수행하게 되는데,
--        sql/63이 항상 그 뒤(접두어 순서 53→63)에 실행되어 결과적으로 다시
--        삭제한다 — sql/63 0-e)절에 재생 시나리오를 전부 추적해뒀다.
-- =====================================================================
insert into public.products
  (slug, service_key, service_name, service_desc, service_sort_order, sort_order, name, list_price, price, badge, is_recommended)
values
  -- 위닝 목표관리
  ('goal-1m',  'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 1, '[1개월 이용권] 위닝 목표관리',  30000,  30000, null,      false),
  ('goal-3m',  'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 2, '[3개월 이용권] 위닝 목표관리',  90000,  81000, '10% 할인', false),
  ('goal-6m',  'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 3, '[6개월 이용권] 위닝 목표관리', 180000, 144000, '20% 할인', false),
  ('goal-12m', 'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 4, '[12개월 이용권] 위닝 목표관리', 360000, 216000, '40% 할인', true),

  -- 위닝 수시예측은 삭제됨(2026-08-11) — 고객사 요금표·최종본 둘 다에 없는
  -- 판매 대상 외 서비스다. 과거 시드값·복구 이력은 sql/53_pricing_susi_
  -- restore.sql 주석에 남아 있다. sql/63_pricing_final_alignment.sql 0-e)절
  -- 참고: 이 행을 여기서 빼도 sql/53 1-a insert가 신규 DB에서 되살릴 수 있지만
  -- sql/63이 항상 그 뒤에 실행돼 다시 삭제하므로 최종 상태는 동일하다.

  -- 위닝 콜멘토
  ('mentor-1', 'mentor', '위닝 콜멘토', '검증된 위닝에듀 멘토와 전화 상담을 진행하는 서비스입니다.', 3, 1, '[30분 이용권] 콜멘토', 50000, 50000, null, false),

  -- 위닝 수행평가 (구 "위닝 AI수행평가" — 2026-08-11 사용자 지시로 "AI" 제거)
  ('suhaeng-1',  'suhaeng', '위닝 수행평가', '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 1, '[1회 이용권] 위닝 수행평가',       3500,   3500, null,      false),
  ('suhaeng-2',  'suhaeng', '위닝 수행평가', '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 2, '[1개월 2회 이용권] 위닝 수행평가',        5000,   5000, null,      false),
  ('suhaeng-6',  'suhaeng', '위닝 수행평가', '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 3, '[3개월 6회 이용권] 위닝 수행평가',  15000,  13500, '10% 할인', false),
  ('suhaeng-14', 'suhaeng', '위닝 수행평가', '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 4, '[6개월 14회 이용권] 위닝 수행평가', 30000,  24000, '20% 할인', false),
  ('suhaeng-30', 'suhaeng', '위닝 수행평가', '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 5, '[12개월 30회 이용권] 위닝 수행평가', 60000,  42000, '30% 할인', true)

  -- 위닝 학습진단(diagnose-1)도 삭제됨(2026-08-11) — 학습진단은 무료 서비스인데
  -- 10,000원 유료 상품으로 올라가 있었다(무료인 것에 돈을 받는 상태). dev에서
  -- 2026-08-06 운영자가 직접 추가했던 행이며, 43_learning_diagnosis_rename.sql은
  -- 테이블/카피만 rename했을 뿐 이 상품 행을 만든 적이 없다.
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 구 형상(sql/00_base_schema.sql, 2026-07-27 스냅샷) 커버 — 그 스냅샷의
-- coupons 는 id 가 아직 text 이고 slug/max_uses_per_user/grant_type 컬럼이
-- 없다(sql/56_surrogate_uuid_keys.sql/sql/55_coupon_policy.sql 이전 상태).
-- sql/00 → sql/10 순서로 신규 DB를 만들면(README 접두어 순서) 아래 시드
-- INSERT 가 slug 컬럼을 참조해 42703(undefined_column)으로 죽는다
-- (2026-08-12 팀 리드 실측). sql/56 이 결국 id 를 uuid 로 전환하며 이
-- 컬럼들을 온전히 갖추지만 그 파일은 이 파일(10)보다 뒤에 실행되므로,
-- 이 시드가 도는 시점엔 이미 아래 세 컬럼이 있어야 한다. 정의는
-- sql/55_coupon_policy.sql:287(max_uses_per_user)·:390(grant_type),
-- sql/56_surrogate_uuid_keys.sql:203(slug)과 글자까지 맞춘다(add column
-- if not exists 라 그 두 파일이 이미 적용된 DB에서는 전부 no-op).
alter table public.coupons add column if not exists slug text;
alter table public.coupons add column if not exists max_uses_per_user integer;
alter table public.coupons add column if not exists grant_type text not null default 'auto';

-- 아래 시드의 `on conflict (slug)`가 arbiter 로 쓸 유니크 제약이 이
-- 시점에 이미 있어야 한다(없으면 42P10). sql/56 과 이름·정의를 맞춘다
-- (coupons_slug_key) — 단순히 `create unique index if not exists` 로
-- 먼저 인덱스만 만들면, 뒤이어 실행되는 sql/56 의 같은 이름 존재 확인이
-- pg_constraint 만 보고(순수 인덱스는 잡히지 않음) 다시
-- `add constraint coupons_slug_key unique (slug)` 를 시도해 42P07(관계
-- 이미 존재)로 죽는다(2026-08-12 팀 리드가 dev 스크래치 테이블로 직접
-- 재현). sql/56 과 완전히 같은 "pg_constraint 존재 확인 DO 블록 + ADD
-- CONSTRAINT" 패턴을 그대로 써서 이 충돌 자체를 없앤다. slug 는 sql/00
-- 구 형상 경로에서 이 시점에 비어 있을 수 있어(신규 컬럼, 아직 값 없음)
-- NOT NULL 은 걸지 않는다 — sql/56 이 백필 뒤에 건다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'coupons_slug_key' and conrelid = 'public.coupons'::regclass
  ) then
    alter table public.coupons add constraint coupons_slug_key unique (slug);
  end if;
end $$;

-- ⚠️ 2026-08-12: 컬럼 목록에 grant_type을 추가했다 — 없으면 재실행이
--    23514로 죽는 사고가 있었다(speculative insertion 사고 경위). `on
--    conflict (slug) do nothing`은 후보 행이 유니크 제약을 어길 때만
--    INSERT를 건너뛰는데(speculative insertion), 그 판정보다 CHECK
--    제약 평가가 먼저다 — grant_type을 명시하지 않으면 DEFAULT('auto')를
--    받는데, signup-2000 행처럼 max_uses_per_user=1을 같이 주면
--    grant_type='auto'인 채로 coupons_per_user_cap_requires_grant_check
--    (grant_type='granted' or max_uses_per_user is null)를 위반해 충돌
--    여부와 무관하게 매 재실행마다 23514로 죽는다(dev 실측, 2026-08-12
--    팀 리드 확인). 아래처럼 grant_type을 명시하면 이 문제 자체가 없다.
insert into public.coupons (slug, code, title, discount_amount, min_amount, valid_until, max_uses_per_user, grant_type)
values
  -- 2026-08-11: discount_amount/title/valid_until을 dev 실측값으로 갱신(위 안내
  -- 참고). 과거 시드는 6000원/'회원가입 특별할인'/2026-08-15였다 — 53번 파일이
  -- valid_until만 2026-12-31로 marker 가드 UPDATE했고 discount_amount/title은
  -- "운영 중인 값이라 건드리지 않는다"고 명시적으로 보류해뒀던 것을, 이번에
  -- 시드 자체를 갱신하는 것으로 정리한다.
  -- slug 는 'signup-2000' 이다(구 id 'signup-6000' 이 실제 할인액 2,000원과
  -- 어긋나 있던 것을 uuid 전환 때 정정 — sql/56_surrogate_uuid_keys.sql).
  -- max_uses_per_user는 sql/55_coupon_policy.sql이 DEFAULT를 1로 바꿔서
  -- (signup-2000 1인당 1회 제한을 만들기 위함), 나머지 두 쿠폰까지 DEFAULT에
  -- 맡기면 상시 할인(4만원/8만원 이상 할인)이 의도치 않게 1회용이 되어버린다.
  -- 그래서 세 행 모두 dev 실물 값을 DEFAULT에 기대지 않고 명시한다.
  -- grant_type은 signup-2000만 'granted'(발급형, sql/55 0-e절) — 나머지 두
  -- 쿠폰은 조건형(상시 할인)이라 DEFAULT와 같은 값이지만 sql/70_coupon_
  -- cap_derivation.sql이 max_uses_per_user의 DEFAULT를 걷어낸 뒤로는 이
  -- 컬럼도 값을 생략할 근거가 없어 세 행 모두 명시한다.
  ('signup-2000', null, '회원가입 축하 쿠폰', 2000, 0, '2026-12-31', 1, 'granted'),
  -- over200k-5000(20만원 이상 5,000원 할인)은 운영자가 2026-07-31에 삭제하고
  -- 아래 두 쿠폰으로 교체했다 — dev에 더 이상 존재하지 않아 시드에서도 뺀다.
  -- valid_until이 둘 다 null이다 — 이 저장소에서 valid_until IS NULL은
  -- "무기한"을 뜻하는 명시적 규약이다(coupons.max_uses_per_user/max_redemptions,
  -- program_access.expires_at 도 동일한 NULL=무기한 규약을 쓴다).
  -- fn_usable_coupons/fn_coupon_by_code(sql/55_coupon_policy.sql)가
  -- `c.valid_until is null or c.valid_until >= v_today`로 판정하므로 이 두
  -- 쿠폰은 계속 eligible로 반환된다 — dev 실측으로도 subtotal 67,500에서
  -- over40k-3000이, 120,000에서 over40k-3000·over80k-5000 둘 다 eligible임을
  -- 확인했다. (과거 이 자리에는 클라이언트가 `.gte('valid_until', today)`로
  -- 걸러 null이 통과하지 못한다는 주석이 있었는데, 그 필터는 쿠폰 판정을
  -- DB(fn_usable_coupons)로 통합하면서 제거됐다 — 지금은 해당하지 않는다.)
  ('over40k-3000', null, '4만원 이상 구매 시 3,000원 할인', 3000, 40000, null, null, 'auto'),
  ('over80k-5000', null, '8만원 이상 구매 시 5,000원 할인', 5000, 80000, null, null, 'auto')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- refund_requests : 고객 환불 신청 (마이페이지 > 환불신청)
-- ---------------------------------------------------------------------
create table if not exists public.refund_requests (
  id             bigint generated always as identity primary key,
  user_id        uuid references auth.users (id) on delete set null,
  order_id       text references public.orders (id) on delete set null,
  order_name     text,
  amount         int  not null default 0,
  reason         text,
  refund_bank    text,
  refund_account text,
  refund_holder  text,
  status         text not null default 'requested', -- requested | processing | completed | rejected
  admin_memo     text,
  created_at     timestamptz not null default now()
);

create index if not exists refund_requests_user_idx on public.refund_requests (user_id, created_at desc);

alter table public.refund_requests enable row level security;

-- 본인 신청만 조회/생성 가능. 처리(상태 변경)는 서버(service_role)/관리자만.
drop policy if exists "refund_requests select own" on public.refund_requests;
create policy "refund_requests select own" on public.refund_requests
  for select using (auth.uid() = user_id);

drop policy if exists "refund_requests insert own" on public.refund_requests;
create policy "refund_requests insert own" on public.refund_requests
  for insert with check (auth.uid() = user_id);
