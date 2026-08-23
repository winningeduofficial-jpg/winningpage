-- ---------------------------------------------------------------------
-- 「매출 및 결제」의 데이터 원천 — 실제 결제(orders/order_items) 기반 뷰.
--
-- 왜 필요한가
--   지금 어드민의 「매출 조정」·「매출 정산」은 payments 테이블을 보는데, 그건
--   운영자가 손으로 적는 수기 장부다. 게다가 화면이 그리는 컬럼(payer_name,
--   program_name, sale_amount, paid_amount)이 실제 payments 스키마에 **하나도
--   없어서**(2026-08-23 실측) 빈 화면으로 뜬다.
--   진짜 결제는 orders/order_items 에 있고 토스와 이어져 있다 — 유저가 쓰는 DB 와
--   어드민이 보는 DB 가 갈라져 있던 대표 사례다. 그 갈라짐을 여기서 합친다.
--
-- 행 단위 = order_item (주문이 아니라 **서비스 한 건**)
--   시안(Figma 4466:7097)이 서비스별 탭(전체/목표관리/콜멘토/수행평가/성장설계/
--   자기평가/심화탐구)을 요구한다. 학부모 결제는 한 주문에 여러 서비스를 담을 수
--   있으므로(ParentCheckout), 주문 단위로 두면 "목표관리 매출"을 낼 수 없다.
--
-- 할인 안분 — 이 뷰에서 제일 조심할 부분
--   할인(쿠폰)은 **주문 단위**(orders.discount_amount)인데 표는 서비스별로 금액을
--   보여줘야 한다. 그래서 아이템의 정가 비중대로 나눈다. 분모는 orders.list_amount
--   가 아니라 **그 주문 아이템들의 정가 합**을 창 함수로 직접 구한다 — 둘이 어긋난
--   주문이 있어도 뷰 안에서 합이 맞도록.
--   ⚠️ 반올림 때문에 아이템 합계가 orders.amount 와 원 단위로 다를 수 있다.
--      마지막 아이템에 잔액을 몰아주는 보정은 하지 않았다 — 매출 집계에서 원 단위
--      차이는 무의미하고, 보정 로직이 오히려 읽기 어려워진다.
--
-- 환불 판정 = **실제 환불 완료 기준**(사용자 확정 2026-08-23)
--   노션 기획에는 "환불이 승인된 거 기준"이라 적혀 있지만, 승인(approval_status)과
--   실제 환불(refund_requests.status='completed', 토스 취소 성공)은 다른 단계다.
--   승인 기준으로 빼면 토스 취소가 실패했을 때 **돈은 안 나갔는데 매출만 줄어든다.**
--   그래서 completed 만 센다 — 실제 입금액과 일치하는 쪽을 정본으로 삼는다.
--
-- 매출 = 정상 최종결제금액 합 - 환불 완료 금액 합.
-- ---------------------------------------------------------------------

create or replace view public.admin_revenue_items
with (security_invoker = on) as
with item_base as (
  select
    oi.id                                      as order_item_id,
    oi.order_id,
    oi.service_key,
    oi.name                                    as item_name,
    coalesce(oi.quantity, 1)                   as quantity,
    coalesce(oi.list_price, oi.price, 0) * coalesce(oi.quantity, 1) as list_amount,
    o.user_id                                  as payer_profile_id,
    o.student_profile_id,
    o.discount_amount                          as order_discount_amount,
    o.paid_at,
    o.status                                   as order_status,
    o.method,
    -- 같은 주문 안의 정가 합 = 할인 안분의 분모
    sum(coalesce(oi.list_price, oi.price, 0) * coalesce(oi.quantity, 1))
      over (partition by oi.order_id)          as order_list_total
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
),
item_amounts as (
  select
    b.*,
    -- 분모가 0이면(정가가 전부 0인 이상 주문) 할인을 나눌 근거가 없으므로 0으로 둔다.
    case
      when b.order_list_total > 0
        then round(b.order_discount_amount::numeric * b.list_amount / b.order_list_total)
      else 0
    end as discount_amount
  from item_base b
)
select
  a.order_item_id,
  a.order_id,
  a.paid_at,
  a.order_status,
  a.method,

  a.payer_profile_id,
  payer.name                                   as payer_name,
  payer.email                                  as payer_email,

  a.student_profile_id,
  student.name                                 as student_name,

  a.service_key,
  a.item_name,
  a.quantity,

  a.list_amount,
  a.discount_amount,
  (a.list_amount - a.discount_amount)          as paid_amount,

  -- 실제 환불이 끝난 금액만 센다(위 ⚠️ 참고). 한 아이템에 부분환불이 여러 번
  -- 있을 수 있어 합으로 받는다.
  coalesce(refund.refunded_amount, 0)          as refunded_amount,
  case
    when coalesce(refund.refunded_amount, 0) > 0 then 'refunded'
    else 'normal'
  end                                          as revenue_status,
  -- 매출 기여분. 화면은 이 값만 더하면 된다.
  (a.list_amount - a.discount_amount - coalesce(refund.refunded_amount, 0))
                                               as net_amount
from item_amounts a
left join public.profiles payer   on payer.id   = a.payer_profile_id
left join public.profiles student on student.id = a.student_profile_id
left join lateral (
  select sum(r.amount) as refunded_amount
    from public.refund_requests r
   where r.order_item_id = a.order_item_id
     and r.status = 'completed'
) refund on true
-- 결제가 성립하지 않은 주문은 매출이 아니다. 'refunded' 는 남긴다 —
-- 환불된 건도 표에 '환불' 상태로 보여야 하기 때문이다(시안의 상태 열).
where a.order_status in ('paid', 'refunded');

comment on view public.admin_revenue_items is
  '「매출 및 결제」 화면의 원천(20260823000005). 행 = order_item 한 건이고, 주문 단위 할인은 정가 비중대로 안분한다. 환불은 refund_requests.status=''completed'' 만 센다(승인이 아니라 실제 환불 완료 기준 — 사용자 확정 2026-08-23). 매출은 net_amount 합으로 낸다. security_invoker=on 이므로 orders/order_items 의 RLS(is_admin())가 그대로 적용된다.';

grant select on public.admin_revenue_items to authenticated;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 아이템 합계가 주문 금액과 맞는지 (반올림 오차 외에 차이가 없어야 한다).
-- select o.id, o.amount, sum(v.list_amount - v.discount_amount) as item_sum
--   from public.orders o
--   join public.admin_revenue_items v on v.order_id = o.id
--  group by o.id, o.amount
-- having abs(o.amount - sum(v.list_amount - v.discount_amount)) > 10;
--
-- 2) 서비스별 매출.
-- select service_key, sum(net_amount) from public.admin_revenue_items group by 1;
