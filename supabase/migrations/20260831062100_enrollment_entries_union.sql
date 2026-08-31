-- =====================================================================
-- 「수강 신청 내역」을 온라인 결제 + 오프라인 장부 합집합으로 바꾼다 (QA 272·227).
--
-- 왜 다시 만드나 — 하나 앞 마이그레이션(20260831053500)의 전제가 틀렸다
--   그 마이그레이션은 "오프라인 수강 건에 주문번호를 손으로 이어 결제 정보를
--   끌어온다"는 설계였다. 그런데 실측 결과 `enrollments` 는 **dev 0행 · 운영 0행**
--   이고, 사이트에 입력 화면도 없으며, 위닝측이 오프라인 접수를 아예 하지 않고
--   있다(서비스 미런칭, 2026-08-31 확인). 이을 대상이 없으니 화면은 영원히 빈
--   채로 남는다.
--
--   QA 272 가 요구한 항목이 **결제방식·승인번호**라는 점이 방향을 말해준다 —
--   수기 장부에 적을 값이 아니라 온라인 결제에서 나오는 값이다. 메뉴 위치도
--   매출·결제관리 그룹이다. 즉 위닝측은 이 화면에서 **결제한 사람들**을 보려 한다.
--
--   같은 병을 「매출 및 결제」에서 이미 앓고 고쳤다 — 수기 장부 3종이 실제 결제와
--   따로 놀아 빈 화면이었고, orders 기반 뷰(admin_revenue_items, 20260823000011)로
--   갈아끼워 해결했다. 여기도 같은 처방이다.
--
-- 설계
--   행 단위는 **order_item 한 건**이다(admin_revenue_items 와 같은 결). 한 주문에
--   여러 강좌가 담기면 강좌별로 한 줄씩 나와야 "수강 신청 내역"이 된다.
--
--   오프라인 장부(enrollments)도 같은 모양으로 union 해 남긴다. 지금은 0행이지만
--   런칭 후 오프라인 접수를 시작하면 그대로 섞여 나온다 — 그때 이 뷰를 다시
--   고칠 필요가 없다. 20260831053500 이 놓은 order_id 컬럼도 그대로 둔다(nullable
--   이라 해가 없고, 오프라인 건을 온라인 주문에 잇고 싶을 때 쓸 수 있다).
--
-- ⚠️ 이 화면은 **읽기 전용**이 된다. 합집합이라 id 가 두 원장에서 오고, 온라인 건은
--    어드민이 고칠 대상이 아니다(주문을 손으로 수정하면 매출과 어긋난다). 오프라인
--    접수 등록 화면은 실제로 접수를 시작할 때 별도로 만든다.
--
-- ⚠️ status 는 '결제가 성립한 것'만 싣는다(paid / refunded). pending·failed·canceled
--    는 신청 내역이 아니라 실패 이력이다. waiting_deposit(가상계좌 미입금)은 뺀다 —
--    돈이 안 들어온 건을 수강 신청으로 세면 안 된다(20260821 confirm-payment 주석).
-- =====================================================================

-- ⚠️ create or replace 로는 안 된다 — 컬럼을 빼거나 순서를 바꾸는 교체를 Postgres 가
--    거부한다(42P16 cannot drop columns from view). 앞 뷰(20260831053500)에 있던
--    profile_id · application_status · updated_at · order_paid_at 이 여기서 사라지므로
--    먼저 떨어뜨리고 새로 만든다. 이 뷰를 참조하는 다른 객체는 없다(화면이 PostgREST
--    로 직접 읽는 것뿐) — 그래서 cascade 없이 안전하게 지워진다.
drop view if exists public.admin_enrollment_entries;

create view public.admin_enrollment_entries
with (security_invoker = on)
as

-- 1) 온라인 결제분 — order_items 한 줄 = 수강 신청 한 건.
select
  'order:' || oi.id::text                      as id,
  '온라인'                                      as source,
  coalesce(o.paid_at, o.created_at)            as created_at,
  o.id                                         as order_id,

  null::text                                   as term_name,
  -- 종목 = 서비스 구분. products.service_name 이 한글 정본이고, 상품이 지워진
  -- 옛 주문은 service_key 로 물러난다(빈 칸보다 영문 키라도 보이는 편이 낫다).
  coalesce(p.service_name, oi.service_key)     as category_name,
  oi.name                                      as program_name,
  null::text                                   as class_name,

  parent.name                                  as guardian_name,
  coalesce(student.name, payer.name)           as student_name,
  coalesce(student.phone, payer.phone)         as phone,
  null::text                                   as grade,
  null::text                                   as school_name,

  case o.status
    when 'refunded' then '환불완료'
    else '납부완료'
  end                                          as payment_status,
  o.method                                     as payment_method,
  -- 카드 승인번호. 가상계좌·계좌이체엔 승인번호 개념이 없어 NULL 이 정상이다 —
  -- payment_key(결제 토큰)로 대신 채우지 않는다. 그건 승인번호가 아니라서 대사에
  -- 쓰면 틀린다.
  o.raw -> 'card' ->> 'approveNo'              as approval_no,

  coalesce(oi.list_price, oi.price, 0) * coalesce(oi.quantity, 1) as price,
  0                                            as discount_amount,
  coalesce(oi.price, 0) * coalesce(oi.quantity, 1)               as paid_amount,
  null::text                                   as memo
from public.order_items oi
join public.orders o          on o.id = oi.order_id
left join public.products p   on p.id = oi.product_id
left join public.profiles payer   on payer.id   = o.user_id
left join public.profiles student on student.id = o.student_profile_id
left join public.profiles parent  on parent.id  = o.parent_profile_id
where o.status in ('paid', 'refunded')

union all

-- 2) 오프라인 장부분 — 지금은 0행이지만 접수를 시작하면 그대로 섞여 나온다.
select
  'enroll:' || e.id::text                      as id,
  '오프라인'                                    as source,
  e.created_at,
  e.order_id,

  e.term_name,
  e.category_name,
  e.program_name,
  e.class_name,

  e.guardian_name,
  e.student_name,
  e.phone,
  e.grade,
  e.school_name,

  e.payment_status,
  -- 오프라인 건도 주문에 연결돼 있으면 결제 정보를 끌어온다(20260831053500).
  o.method                                     as payment_method,
  o.raw -> 'card' ->> 'approveNo'              as approval_no,

  e.price,
  e.discount_amount,
  e.paid_amount,
  e.memo
from public.enrollments e
left join public.orders o on o.id = e.order_id;

comment on view public.admin_enrollment_entries is
  '「수강 신청 내역」 화면의 원천(20260831062100). 온라인 결제(order_items, status paid/refunded)와 오프라인 장부(enrollments)의 합집합이고 행 단위는 강좌 한 건이다. id 는 ''order:''/''enroll:'' 접두사로 두 원장을 구분한다 — 화면은 읽기 전용이라 이 id 로 수정하지 않는다. security_invoker=on 이라 orders/enrollments 의 RLS 가 그대로 적용된다.';

grant select on public.admin_enrollment_entries to authenticated;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 두 원장이 함께 나오는지.
-- select source, count(*) from public.admin_enrollment_entries group by 1;
--
-- 2) 결제방식·승인번호가 실리는지. 승인번호는 카드 결제만 값이 있다.
-- select created_at, student_name, category_name, payment_method, approval_no
--   from public.admin_enrollment_entries order by created_at desc limit 20;
