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
  status          text not null default 'pending', -- pending | paid | failed | canceled
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
-- 시드 데이터 (상품 / 쿠폰)  ※ 가격이 바뀌면 이 값을 갱신하세요.
-- =====================================================================
insert into public.products
  (id, service_key, service_name, service_desc, service_sort_order, sort_order, name, list_price, price, badge, is_recommended)
values
  -- 위닝 목표관리
  ('goal-1m',  'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 1, '[1개월] 위닝 목표관리',  30000,  30000, null,      false),
  ('goal-3m',  'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 2, '[3개월] 위닝 목표관리',  90000,  81000, '10% 할인', false),
  ('goal-6m',  'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 3, '[6개월] 위닝 목표관리', 180000, 144000, '20% 할인', false),
  ('goal-12m', 'goal', '위닝 목표관리', '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.', 1, 4, '[12개월] 위닝 목표관리', 360000, 252000, '30% 할인', true),

  -- 위닝 수시예측
  ('susi-1',  'susi', '위닝 수시예측', '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.', 2, 1, '[1회 이용권] 위닝 수시예측', 30000, 30000, null,       false),
  ('susi-2',  'susi', '위닝 수시예측', '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.', 2, 2, '[2회 이용권] 위닝 수시예측', 60000, 55000, '약 8% 할인', false),
  ('susi-30', 'susi', '위닝 수시예측', '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.', 2, 3, '[12개월 30회 이용권] 위닝 수시예측', 90000, 80000, '약 11% 할인', true),

  -- 위닝 콜멘토
  ('mentor-1', 'mentor', '위닝 콜멘토', '검증된 위닝에듀 멘토와 전화 상담을 진행하는 서비스입니다.', 3, 1, '[이용권] 콜멘토', 50000, 50000, null, false),

  -- 위닝 AI수행평가
  ('suhaeng-1',  'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 1, '[1회 이용권] 위닝 AI수행평가',       4900,   4900, null,      false),
  ('suhaeng-2',  'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 2, '[1개월 2회] 위닝 AI수행평가',        9000,   9000, null,      false),
  ('suhaeng-6',  'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 3, '[3개월 6회 이용권] 위닝 AI수행평가',  26667,  24000, '10% 할인', false),
  ('suhaeng-14', 'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 4, '[6개월 14회 이용권] 위닝 AI수행평가', 54000,  43200, '20% 할인', false),
  ('suhaeng-30', 'suhaeng', '위닝 AI수행평가', 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.', 4, 5, '[12개월 30회 이용권] 위닝 AI수행평가', 108000, 75600, '30% 할인', true)
on conflict (id) do update set
  service_key        = excluded.service_key,
  service_name       = excluded.service_name,
  service_desc       = excluded.service_desc,
  service_sort_order = excluded.service_sort_order,
  sort_order         = excluded.sort_order,
  name               = excluded.name,
  list_price         = excluded.list_price,
  price              = excluded.price,
  badge              = excluded.badge,
  is_recommended     = excluded.is_recommended,
  is_active          = true;

insert into public.coupons (id, code, title, discount_amount, min_amount, valid_until)
values
  ('signup-6000',   null, '회원가입 특별할인',            6000,      0, '2026-08-15'),
  ('over200k-5000', null, '20만원 이상 구매 시 5,000원 할인', 5000, 200000, '2026-08-15')
on conflict (id) do update set
  title           = excluded.title,
  discount_amount = excluded.discount_amount,
  min_amount      = excluded.min_amount,
  valid_until     = excluded.valid_until,
  is_active       = true;

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
