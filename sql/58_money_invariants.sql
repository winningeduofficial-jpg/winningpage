-- =====================================================================
-- 금액 관련 CHECK 제약 도입 (결제 도메인 4개 테이블)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — 감사 결과 M14 (P1)
--   결제 도메인 4개 테이블(orders/products/order_items/coupons)에 금액
--   관련 CHECK 제약이 0건이었다(dev 실측). 유일하게 있던 건 coupons의
--   횟수 컬럼(max_uses_per_user/max_redemptions, sql/55_coupon_policy.sql
--   0)/0-b)절)와 orders.status 어휘(sql/57 이 아니라 sql/55 0-d절이 붙였다)
--   뿐 — 금액 컬럼은 하나도 막혀 있지 않았다.
--
--   가장 구체적인 실패 시나리오: coupons.discount_amount 에 `> 0`이 없다.
--   sql/55_coupon_policy.sql:1642-1670 fn_redeem_coupons 의 stacking 정산
--   루프를 직접 추적하면(아래 참고), 음수 할인 쿠폰이 이 파일 도입 전에는
--   0원 방지 분기(`v_coupon_discount + v_cand_discounts[v_i] >= p_subtotal`)
--   를 절대 통과시키지 않아 그대로 적용되고, 결과적으로
--     orders.amount = list_amount - discount_amount 가 "성립한 채로"
--     discount_amount 자체가 음수가 되어 amount 가 list_amount 를 초과한다
--   (정가 80,000원 상품에 할인 -5,000원 쿠폰 하나만 적용해도 amount=85,000).
--   api/confirm-payment.js 의 금액 대조는 화면 표시액과 orders.amount 를
--   비교하는 것이라 둘 다 같이 틀려서 통과한다 — DB 제약만이 이 경로를
--   근본적으로 막는다.
--
-- 방법론 — 무비판적으로 걸지 않는다
--   아래 14개 후보 전부에 대해 sql/55_coupon_policy.sql(특히 fn_redeem_
--   coupons 본문 1573-1729행) 과 api/create-order.js / api/confirm-payment.js
--   / api/toss-webhook.js 를 직접 읽어 "이게 항상 참인가"를 코드로 확인했다.
--   그 결과와 근거를 각 절 주석에 남긴다. dev 실측(적용 전, 2026-08-11):
--   products 14 / coupons 3 / orders 1 / order_items 2 / coupon_redemptions 0
--   — 14개 후보 전부 위반 행 0건이었다(각 제약 걸기 전 개별 조회로 확인).
--
--   특히 신중히 본 4개:
--     · orders.amount = list_amount - discount_amount
--         fn_redeem_coupons 를 라인 단위로 추적하면, v_amount 를 계산하는
--         `greatest(0, p_list_amount - v_discount_total)` 이 0 이하로
--         떨어지는 경우는 즉시 `raise exception ... errcode='WC001'`로
--         트랜잭션 전체(orders insert 포함)를 롤백한다(1679-1688행) — 즉
--         "이 등식이 깨지는" 경로는 애초에 커밋되지 않는다. 등식이 깨지지
--         않는 나머지 모든 경로에서는 v_amount 가 정의상
--         `p_list_amount - v_discount_total` 그 자체다. 그래서 이 함수를
--         통과해 커밋된 모든 행은 이 등식을 항상 만족한다. 또한 grep 확인상
--         orders 에 INSERT 하는 코드 경로는 이 함수 하나뿐이고(api/·sql/
--         전체에서 `insert into ... orders` / `.from('orders').insert`가
--         fn_redeem_coupons 안 1696행 단 한 곳), api/confirm-payment.js·
--         api/toss-webhook.js 는 amount/list_amount/discount_amount 세
--         컬럼을 전혀 UPDATE 하지 않는다(grep 확인 — status/payment_key/
--         method/paid_at/raw 만 건드린다). 그래서 이 등식을 건다.
--     · orders.amount >= 0 vs > 0
--         위와 같은 이유로 `v_amount <= 0`은 항상 WC001 예외로 롤백되어
--         0원 주문 자체가 커밋될 수 없다(P1-8 100% 할인 쿠폰도 이 방어선에
--         걸린다 — sql/55 1679-1688행 주석 "0원화는 이미 막았으므로" 참고).
--         그래서 더 엄격한 `> 0`을 건다.
--     · products.price <= list_price
--         이 저장소엔 상품 편집 어드민 화면이 없다(sql/55 1-d-2절 "어드민
--         UI 가 없어 운영자가 Supabase Studio 로 직접 조작한다" — 상품도
--         동일 전제, grep 확인상 src/에 list_price 를 쓰는 화면은
--         Checkout.jsx/Pricing.jsx 뿐이고 둘 다 읽기 전용이다). 즉 사람이
--         손으로 값을 넣는 유일한 경로이고 코드 레벨 가드가 없다 — DB 제약이
--         유일한 방어선이다. sql/10_pricing_orders.sql 시드 14행을 전부
--         확인(price <= list_price, diagnose-1 은 10000=10000 으로 동률)했고
--         dev 실측도 위반 0건이라 건다.
--     · orders.amount >= 0 (0원 주문 가능성) — 위 orders.amount > 0 항목과
--       동일 사안으로 합쳐 결론 냈다(WC001 이 구조적으로 0원을 막는다).
--
-- 제약 이름 규약 — 이 저장소 기존 이름(coupons_max_uses_per_user_check,
--   orders_status_check)을 따른다. 단일 컬럼은 <테이블>_<컬럼>_check, 여러
--   컬럼에 걸친 의미는 <테이블>_<의미>_check.
--
-- 절대 규칙 — drop constraint if exists → add constraint 쌍으로 멱등.
--   재실행 시 no-op. 기존 데이터는 건드리지 않는다(위반 행이 있었다면 이
--   파일은 그 행을 고치지 않고 팀 리드에게 보고했을 것 — 실측상 위반 0건
--   이라 이 파일에 데이터 수정 문장은 없다).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) products : 정가/판매가.
--    list_price/price 는 sql/10_pricing_orders.sql 에서 not null 이라 NULL
--    은 이미 스키마 레벨에서 불가능 — 이 CHECK 는 "음수"와 "정가 역전"만 막는다.
-- ---------------------------------------------------------------------
alter table public.products
  drop constraint if exists products_list_price_check;
alter table public.products
  add constraint products_list_price_check
  check (list_price >= 0);

alter table public.products
  drop constraint if exists products_price_check;
alter table public.products
  add constraint products_price_check
  check (price >= 0);

-- 정가보다 비싼 판매가는 이 도메인에 존재할 이유가 없다(할인 후 가격이
-- 할인 전 가격을 넘는 건 "할인"이 아니다). 동률(price = list_price, 정가
-- 그대로 판매)은 허용한다 — 위 배경 절에서 시드 14행 전부 확인.
alter table public.products
  drop constraint if exists products_price_le_list_price_check;
alter table public.products
  add constraint products_price_le_list_price_check
  check (price <= list_price);

comment on constraint products_price_le_list_price_check on public.products is
  '판매가는 정가를 넘을 수 없다. 이 저장소는 상품 편집 어드민 화면이 없어 Supabase Studio 직접 입력이 유일한 경로다 — 이 CHECK 가 유일한 방어선(M14, 2026-08-11).';

-- ---------------------------------------------------------------------
-- 2) coupons : 정액 할인 규칙.
--    discount_amount/min_amount 도 sql/10 에서 not null — NULL 은 이미 불가능.
-- ---------------------------------------------------------------------
-- 배경 절의 핵심 시나리오. 음수 할인이 fn_redeem_coupons 의 0원 방지 분기를
-- 우회해 결제 금액이 정가를 초과하게 만드는 경로를 원천 차단한다. 0 은
-- "할인 없음"이 아니라 "할인 쿠폰인데 할인이 없다"는 모순 상태라 함께 막는다
-- (할인이 없는 상품은 애초에 쿠폰을 쓸 이유가 없다 — coupons_max_uses_per_
-- user_check 가 0 을 "쓸 수 없음"이라는 제3의 의미로 보고 막은 것과 같은 원칙).
alter table public.coupons
  drop constraint if exists coupons_discount_amount_check;
alter table public.coupons
  add constraint coupons_discount_amount_check
  check (discount_amount > 0);

comment on constraint coupons_discount_amount_check on public.coupons is
  '음수 할인이 fn_redeem_coupons 의 0원 방지 분기(least/>=subtotal)를 둘 다 우회해 결제 금액이 정가를 초과시키는 경로를 막는다(M14, 2026-08-11). 근거: sql/55_coupon_policy.sql fn_redeem_coupons 1642-1670행.';

alter table public.coupons
  drop constraint if exists coupons_min_amount_check;
alter table public.coupons
  add constraint coupons_min_amount_check
  check (min_amount >= 0);

-- ---------------------------------------------------------------------
-- 3) orders : 주문 헤더 금액 3종 + 정합성 등식.
--    이 저장소에서 orders 에 INSERT 하는 코드 경로는 sql/55_coupon_policy.sql
--    의 fn_redeem_coupons 단 하나다(grep 확인). api/confirm-payment.js·
--    api/toss-webhook.js 는 status/payment_key/method/paid_at/raw 만 UPDATE
--    하고 금액 3컬럼은 절대 건드리지 않는다.
-- ---------------------------------------------------------------------
-- fn_redeem_coupons 는 v_amount<=0 이면 errcode=WC001 로 트랜잭션 전체를
-- 롤백한다(sql/55:1679-1688) — 0원 이하 주문은 애초에 커밋되지 않으므로
-- >= 0 이 아니라 더 엄격한 > 0 을 건다.
alter table public.orders
  drop constraint if exists orders_amount_check;
alter table public.orders
  add constraint orders_amount_check
  check (amount > 0);

comment on constraint orders_amount_check on public.orders is
  '0원 이하 주문은 fn_redeem_coupons 의 WC001 예외로 이미 커밋 자체가 불가능하다(sql/55_coupon_policy.sql:1679-1688) — 이 CHECK 는 그 불변식을 DB 레벨에서도 보장한다(M14, 2026-08-11).';

alter table public.orders
  drop constraint if exists orders_list_amount_check;
alter table public.orders
  add constraint orders_list_amount_check
  check (list_amount >= 0);

alter table public.orders
  drop constraint if exists orders_discount_amount_check;
alter table public.orders
  add constraint orders_discount_amount_check
  check (discount_amount >= 0);

-- 정합성 등식. fn_redeem_coupons 를 통과해 커밋된 모든 행은 정의상
-- amount = list_amount - v_discount_total 이다(등식이 깨지는 유일한 경로,
-- 즉 greatest(0,...) 가 0 으로 클램프되는 경우는 WC001 롤백으로 애초에
-- 커밋되지 않는다 — 위 orders_amount_check 주석과 동일 근거).
alter table public.orders
  drop constraint if exists orders_amount_balance_check;
alter table public.orders
  add constraint orders_amount_balance_check
  check (amount = list_amount - discount_amount);

comment on constraint orders_amount_balance_check on public.orders is
  '실결제금액 = 정가합계 - 총할인. fn_redeem_coupons 가 항상 이 등식을 만족하는 값만 커밋한다(sql/55_coupon_policy.sql:1676-1688) — 향후 이 등식을 깨는 코드 변경이 생기면 INSERT/UPDATE 시점에 즉시 드러나게 한다(M14, 2026-08-11).';

-- ---------------------------------------------------------------------
-- 4) order_items : 라인 아이템. list_price/price/quantity 는 sql/10 에서
--    not null default 0/1 — api/create-order.js 가 quantity 를 항상 리터럴
--    1 로 보내고(사용자 입력 아님), list_price/price 는 products 조회
--    결과를 그대로 옮긴 스냅샷이다(과금 정본은 products, 이 함수는 재계산
--    하지 않는다 — sql/55 4)절 주석).
-- ---------------------------------------------------------------------
alter table public.order_items
  drop constraint if exists order_items_quantity_check;
alter table public.order_items
  add constraint order_items_quantity_check
  check (quantity >= 1);

alter table public.order_items
  drop constraint if exists order_items_price_check;
alter table public.order_items
  add constraint order_items_price_check
  check (price >= 0);

alter table public.order_items
  drop constraint if exists order_items_list_price_check;
alter table public.order_items
  add constraint order_items_list_price_check
  check (list_price >= 0);

-- 위 1)절 products_price_le_list_price_check 와 같은 이유 — order_items 는
-- 주문 시점 products 값의 스냅샷이라 products 가 그 등식을 만족하면
-- order_items 도 만족한다(전수 확인 위반 0건).
alter table public.order_items
  drop constraint if exists order_items_price_le_list_price_check;
alter table public.order_items
  add constraint order_items_price_le_list_price_check
  check (price <= list_price);

-- ---------------------------------------------------------------------
-- 5) coupon_redemptions : 사용 이력의 실제 할인액(감사·표시용).
--    sql/55_coupon_policy.sql:1721 이 v_applied_discounts[gs.i] 를 그대로
--    쓰는데, 그 배열은 위 2)절 coupons_discount_amount_check 가 걸리고 나면
--    양수만 담긴다(stacking 정산 단계가 coupons.discount_amount 값을
--    그대로 옮길 뿐 별도 연산을 하지 않는다 — sql/55:1637-1668). 0 은
--    "쿠폰이 적용됐는데 할인이 0원"이라는 모순이라 위 coupons 절과 동일
--    원칙으로 함께 막는다.
-- ---------------------------------------------------------------------
alter table public.coupon_redemptions
  drop constraint if exists coupon_redemptions_discount_amount_check;
alter table public.coupon_redemptions
  add constraint coupon_redemptions_discount_amount_check
  check (discount_amount > 0);

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 이 파일이 실제로 만든 제약 전부.
-- select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as def
-- from pg_constraint
-- where conrelid in (
--   'public.products'::regclass, 'public.coupons'::regclass,
--   'public.orders'::regclass, 'public.order_items'::regclass,
--   'public.coupon_redemptions'::regclass
-- )
-- and contype = 'c'
-- order by conrelid::regclass::text, conname;
--
-- 제약이 실제로 거부하는지 — 반드시 begin...rollback 안에서 별도 실행할 것.
-- begin;
--   insert into public.coupons (slug, code, title, discount_amount, min_amount)
--   values ('__selftest_neg_discount__', null, 'selftest', -1000, 0);
-- rollback;
--   → 기대: ERROR 23514 (check_violation), constraint
--     "coupons_discount_amount_check".
--
-- 정상 결제 경로가 안 깨지는지 — fn_redeem_coupons 를 begin...rollback 안에서
-- 실제 값으로 호출해 주문이 여전히 생성되는지 확인한다(아래는 예시 형태,
-- 실제 product_id/coupon_id 는 dev 값으로 치환해야 한다).
-- begin;
--   select * from public.fn_redeem_coupons(
--     '__selftest_order__', null, null, '셀프테스트',
--     '[{"product_id":"<dev products.id>","product_slug":"goal-1m","service_key":"goal","name":"[1개월] 위닝 목표관리","list_price":25000,"price":25000,"quantity":1}]'::jsonb,
--     25000, 25000, '{}'::uuid[]
--   );
-- rollback;
--   → 기대: 1행 반환, amount=25000, 예외 없음.
-- =====================================================================
