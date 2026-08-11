-- =====================================================================
-- 위닝에듀 결제 상품/주문 스키마 (products / coupons / orders / order_items)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) products : 결제 상품 카탈로그
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id                 text primary key,          -- 예: 'goal-1m'
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
create table if not exists public.coupons (
  id              text primary key,
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
  coupon_id       text references public.coupons (id) on delete set null,
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
  id          bigint generated always as identity primary key,
  order_id    text not null references public.orders (id) on delete cascade,
  product_id  text,
  service_key text,
  name        text not null,
  list_price  int  not null default 0,
  price       int  not null default 0,
  quantity    int  not null default 1,
  created_at  timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);

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
-- ※ on conflict do nothing: 최초 설치(신규 id)만 반영되고, 이미 존재하는
--    상품/쿠폰은 재실행 시 건드리지 않는다. api/create-order.js가 products를
--    결제 신뢰값으로 읽으므로, 이미 저장된 price/is_active(단종·종료 처리 포함)를
--    이 파일 재실행으로 되돌리면 실제 청구 금액·판매 상태가 임의로 바뀐다.
--    가격/카피를 바꾸려면 Supabase에서 해당 행을 직접 update하거나 새 id로
--    행을 추가하세요(예: 'goal-1m' 가격 개편 시 'goal-1m-v2' 신설).
--
-- ⚠️ 2026-08-11: 시드 값을 dev(gjowqdiopinhixfivnkx) 실측값으로 갱신했다.
--    이 파일이 처음 작성된 뒤 운영자가 Supabase에서 직접 가격/쿠폰을 조정해왔고
--    (goal/suhaeng 가격 인하, goal-12m 배지 30%→40%, signup-6000 할인액·만료일
--    변경, over200k-5000 쿠폰을 over40k-3000/over80k-5000으로 교체, diagnose-1
--    상품 직접 추가 — 이 상품은 이전까지 이 파일 어디에도 없었다), 사용자가
--    2026-08-11에 "dev 현재 가격이 신가격 정본"이라고 확정했다. 그런데 이
--    INSERT는 위 주석대로 `on conflict do nothing`으로만 가드돼 있어 marker
--    가드(53번 파일 방식)와 달리 값 자체에는 아무 조건이 없다 — 즉 값을 여기서
--    고쳐도 id가 이미 존재하는 dev/운영 DB에는 영향이 없고(재실행 시 그대로
--    스킵), 오직 앞으로 이 파일로 새로 만들어질 빈 DB에만 새 값이 들어간다.
--    그래서 과거 이력을 왜곡하지 않고 이 INSERT 리터럴을 직접 고치는 쪽을
--    택했다(53_pricing_susi_restore.sql처럼 marker 가드 UPDATE를 새 번호
--    파일로 추가하는 방식은, 이 파일엔 marker가 없어 오히려 불필요하다).
--    과거 시드값(30000/81000/144000/252000, suhaeng 4900~108000, 배지
--    30% 할인, over200k-5000, signup-6000 6000원/2026-08-15 등)은
--    sql/53_pricing_susi_restore.sql 주석과 git 이력에 남아 있다.
-- =====================================================================
insert into public.products
  (id, service_key, service_name, service_desc, service_sort_order, sort_order, name, list_price, price, badge, is_recommended)
values
  -- 위닝 목표관리
  ('goal-1m',  'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 1, '[1개월] 위닝 목표관리',  25000,  25000, null,      false),
  ('goal-3m',  'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 2, '[3개월] 위닝 목표관리',  75000,  67500, '10% 할인', false),
  ('goal-6m',  'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 3, '[6개월] 위닝 목표관리', 150000, 120000, '20% 할인', false),
  ('goal-12m', 'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 4, '[12개월] 위닝 목표관리', 300000, 180000, '40% 할인', true),

  -- 위닝 수시예측
  ('susi-1',  'susi', '위닝 수시예측', '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.', 2, 1, '[1회 이용권] 위닝 수시예측', 30000, 30000, null,       false),
  ('susi-2',  'susi', '위닝 수시예측', '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.', 2, 2, '[2회 이용권] 위닝 수시예측', 60000, 55000, '약 8% 할인', false),
  ('susi-30', 'susi', '위닝 수시예측', '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.', 2, 3, '[12개월 30회 이용권] 위닝 수시예측', 90000, 80000, '약 11% 할인', true),

  -- 위닝 콜멘토
  ('mentor-1', 'mentor', '위닝 콜멘토', '검증된 위닝에듀 멘토와 전화 상담을 진행하는 서비스입니다.', 3, 1, '[이용권] 콜멘토', 50000, 50000, null, false),

  -- 위닝 AI수행평가
  ('suhaeng-1',  'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 1, '[1회 이용권] 위닝 AI수행평가',       3500,   3500, null,      false),
  ('suhaeng-2',  'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 2, '[1개월 2회] 위닝 AI수행평가',        5000,   5000, null,      false),
  ('suhaeng-6',  'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 3, '[3개월 6회 이용권] 위닝 AI수행평가',  15000,  13500, '10% 할인', false),
  ('suhaeng-14', 'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 4, '[6개월 14회 이용권] 위닝 AI수행평가', 30000,  24000, '20% 할인', false),
  ('suhaeng-30', 'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 5, '[12개월 30회 이용권] 위닝 AI수행평가', 60000,  42000, '30% 할인', true),

  -- 위닝 학습진단 (dev에서 2026-08-06 운영자가 직접 추가한 행. 이전까지 이 시드
  -- 파일에 없었다 — 43_learning_diagnosis_rename.sql이 무료진단→학습진단으로
  -- 테이블/카피만 rename했을 뿐 products 상품 행을 만들지는 않았다.)
  ('diagnose-1', 'diagnose', '위닝 학습진단', null, 99, 99, '위닝 학습진단', 10000, 10000, null, false)
on conflict (id) do nothing;

insert into public.coupons (id, code, title, discount_amount, min_amount, valid_until)
values
  -- 2026-08-11: discount_amount/title/valid_until을 dev 실측값으로 갱신(위 안내
  -- 참고). 과거 시드는 6000원/'회원가입 특별할인'/2026-08-15였다 — 53번 파일이
  -- valid_until만 2026-12-31로 marker 가드 UPDATE했고 discount_amount/title은
  -- "운영 중인 값이라 건드리지 않는다"고 명시적으로 보류해뒀던 것을, 이번에
  -- 시드 자체를 갱신하는 것으로 정리한다.
  ('signup-6000', null, '회원가입 축하 쿠폰', 2000, 0, '2026-12-31'),
  -- over200k-5000(20만원 이상 5,000원 할인)은 운영자가 2026-07-31에 삭제하고
  -- 아래 두 쿠폰으로 교체했다 — dev에 더 이상 존재하지 않아 시드에서도 뺀다.
  -- ⚠️ valid_until이 둘 다 null이다. Checkout.jsx/api/create-order.js가
  --    `.gte('valid_until', today)`로 거르므로 null은 조건을 통과하지 못해
  --    이 두 쿠폰은 주문서 목록에 노출되지 않고 서버 검증에서도 탈락한다(즉
  --    현재 dev에서도 "존재하지만 아무 데서도 선택 불가능"한 상태). 이 시드는
  --    dev 실측값을 그대로 옮긴 것이라 이 문제를 고치지 않는다 — 고칠지는
  --    별도 판단 필요(코드 조건을 `or(valid_until.is.null, ...)`로 바꾸거나
  --    valid_until에 명시적 종료일을 채우는 두 방법이 있다).
  ('over40k-3000', null, '4만원 이상 구매 시 3,000원 할인', 3000, 40000, null),
  ('over80k-5000', null, '8만원 이상 구매 시 5,000원 할인', 5000, 80000, null)
on conflict (id) do nothing;

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
