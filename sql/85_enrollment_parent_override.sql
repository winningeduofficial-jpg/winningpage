-- =====================================================================
-- 85_enrollment_parent_override.sql
-- 학부모가 결제 화면에서 학생이 신청한 상품 구성을 바꿔 결제할 수 있게
-- 한다 — 지금까지는 fn_respond_enrollment(sql/71)로 기존 주문을 그대로
-- 승인/반려만 할 수 있었고, 구성 자체를 바꾸는 경로가 없었다.
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- 이 파일이 하지 않는 것 (명시적 제외)
-- ---------------------------------------------------------------------
--   · 클라이언트/api 배선(MyPage.jsx, api/*) — 별도 작업.
--   · 쿠폰 적용 — 이 함수로 만들어지는 새 주문은 coupon_id 를 항상 NULL
--     로 둔다(범위 밖). 쿠폰은 기존 fn_respond_enrollment 흐름에만 있다.
--   · 항목 단위(부분) 대체 — 이 함수는 원래 요청 전체를 새 주문 하나로
--     통째로 대체한다(부분 대체 없음).
--   · DB 적용 — 파일만 쓴다. 적용·검증은 팀 리드가 한다.
-- =====================================================================


-- =====================================================================
-- 1) orders.approval_status CHECK 제약에 'superseded' 추가.
--    다른 두 CHECK(orders_reject_reason_pairing_check, orders_responded_
--    at_pairing_check, sql/68 114-120행)와의 충돌 여부 —
--      · (approval_status = 'rejected') = (reject_reason is not null) :
--        'superseded' 는 'rejected' 가 아니므로 좌변 false. reject_reason
--        을 NULL 로 유지하면 우변도 false — 통과. 아래 함수는 superseded
--        전환 시 reject_reason 을 절대 세팅하지 않는다.
--      · (approval_status = 'requested') = (responded_at is null) :
--        'superseded' 는 'requested' 가 아니므로 좌변 false. responded_at
--        을 반드시 세팅(now())해야 우변도 false — 통과. 아래 함수는
--        superseded 전환과 함께 responded_at = now() 를 같이 세팅한다.
--    orders_approval_before_payment_check(sql/69 3절, 현재:
--    approval_status='approved' or status in ('pending','canceled',
--    'failed'))도 확인 — 'superseded' 는 'approved' 가 아니므로 status
--    는 반드시 pending/canceled/failed 중 하나여야 한다. 아래 함수는
--    superseded 전환 시 status='canceled' 로 함께 내리므로 충돌 없다.
-- =====================================================================
alter table public.orders drop constraint if exists orders_approval_status_check;
alter table public.orders add constraint orders_approval_status_check
  check (approval_status in ('requested', 'approved', 'rejected', 'superseded'));

comment on constraint orders_approval_status_check on public.orders is
  '승인축 4값(sql/85 로 superseded 추가) — requested/approved/rejected 는 sql/68 원문, superseded 는 학부모가 원래 요청의 상품 구성을 바꿔 새 주문으로 대체했을 때(fn_parent_create_enrollment) 원래 주문에 남는 종결 상태다.';


-- =====================================================================
-- 2) orders.superseded_by_order_id — 원래 요청이 다른 주문으로 대체됐을
--    때 그 새 주문 id 를 가리킨다. nullable, 기본값 없음(대체되지 않은
--    주문은 항상 NULL).
-- =====================================================================
alter table public.orders add column if not exists superseded_by_order_id text references public.orders(id);

comment on column public.orders.superseded_by_order_id is
  '이 주문이 superseded 로 종결됐을 때 그 요청을 대체한 새 주문의 id(fn_parent_create_enrollment 가 채운다). 대체되지 않은 주문은 항상 NULL(sql/85).';


-- =====================================================================
-- 3) orders_superseded_pairing_check — superseded_by_order_id 는
--    approval_status='superseded' 인 주문에만 채워진다(그 반대도 성립).
--    reject_reason/responded_at 페어링 체크(sql/68)와 같은 원칙이다 —
--    지금까지는 이 불변식을 함수 코드만 지키고 있었고 DB 레벨 강제가
--    없었다.
-- =====================================================================
alter table public.orders drop constraint if exists orders_superseded_pairing_check;
alter table public.orders add constraint orders_superseded_pairing_check
  check ((approval_status = 'superseded') = (superseded_by_order_id is not null));

comment on constraint orders_superseded_pairing_check on public.orders is
  'superseded_by_order_id 는 approval_status=superseded 인 주문에만 채워진다(그 반대도 성립) — reject_reason/responded_at 페어링 체크(sql/68)와 같은 원칙(sql/85).';


-- =====================================================================
-- 4) fn_parent_create_enrollment — 학부모가 학생의 미응답 요청(status=
--    pending, approval_status=requested)을 자신이 고른 상품 구성으로
--    대체해 즉시 승인 상태의 새 주문을 만든다.
--
--    권한 모델 — fn_request_enrollment(service_role 전용, 신뢰 경계는
--    호출자)가 아니라 fn_respond_enrollment(authenticated 직접 호출,
--    함수 안에서 auth.uid() 검사) 패턴을 따른다. 클라이언트(브라우저)가
--    supabase.rpc() 로 직접 호출하기 때문이다.
-- ---------------------------------------------------------------------
create or replace function public.fn_parent_create_enrollment(
  p_original_order_id text,
  p_items              jsonb   -- [{product_id}] 형태, 학부모가 최종 선택한 상품 id만 담음
)
returns table (
  order_id        text,
  amount          integer,
  discount_amount integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order           public.orders;
  v_product_ids     uuid[];
  v_product_count   integer;
  v_list_amount     integer;
  v_subtotal        integer;
  v_discount_amount integer;
  v_new_order_id    text;
  v_order_name      text;
  v_first_name      text;
begin
  select * into v_order from public.orders where id = p_original_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC051';
  end if;

  if v_order.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_order_parent' using errcode = 'WC052';
  end if;

  -- 이 함수는 "미응답 요청"만 대체한다 — 원래 요청이 이미 승인/반려/
  -- superseded 등으로 종결됐으면 대체 불가.
  if v_order.approval_status <> 'requested' or v_order.status <> 'pending' then
    raise exception 'order_not_pending_for_override' using errcode = 'WC053';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items_selected' using errcode = 'WC054';
  end if;

  -- 쌍 재검증 — sql/71 WC042 판정 로직과 동일 헬퍼 재사용.
  if not public.fn_is_linked_pair(v_order.student_profile_id, auth.uid()) then
    raise exception 'pair_not_linked' using errcode = 'WC055';
  end if;

  select array_agg(distinct (i ->> 'product_id')::uuid)
    into v_product_ids
    from jsonb_array_elements(p_items) as i;

  select count(*), sum(coalesce(p.list_price, p.price, 0)), sum(coalesce(p.price, 0))
    into v_product_count, v_list_amount, v_subtotal
    from public.products p
   where p.id = any (v_product_ids)
     and p.is_active = true;

  if v_product_count is distinct from array_length(v_product_ids, 1) then
    raise exception 'invalid_products' using errcode = 'WC056';
  end if;

  v_discount_amount := v_list_amount - v_subtotal;

  -- list_price < price 인 상품 데이터가 섞이면 discount_amount 가 음수가
  -- 될 수 있다 — 그대로 두면 아래 INSERT 가 orders_discount_amount_check
  -- (sql/58, discount_amount >= 0)에 걸려 처리되지 않은 raw 23514 로
  -- 죽는다. WC001 을 재사용해(v_subtotal <= 0 과 같은 금액 무결성 오류)
  -- 여기서 먼저 명시적으로 거부한다.
  if v_subtotal <= 0 or v_discount_amount < 0 then
    raise exception 'invalid_amount' using errcode = 'WC001';
  end if;

  v_new_order_id := 'order_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint
                     || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  -- p.id 는 랜덤 UUID 라 order by p.id 로는 매번 다른 상품이 "대표"로
  -- 뽑힌다 — 카탈로그 표시 순서(src/lib/products.ts PRODUCT_COLUMNS 와
  -- 동일한 service_sort_order, sort_order)로 정렬해 결정적으로 만든다.
  select p.name into v_first_name
    from public.products p
   where p.id = any (v_product_ids)
     and p.is_active = true
   order by p.service_sort_order, p.sort_order
   limit 1;

  v_order_name := case when v_product_count > 1
                    then coalesce(v_first_name, '위닝에듀 서비스') || ' 외 ' || (v_product_count - 1) || '건'
                    else coalesce(v_first_name, '위닝에듀 서비스')
                  end;

  -- 새 주문 — 학부모 본인이 결제 주체로서 직접 만드는 주문이라 스스로
  -- 승인 대기시킬 이유가 없다(refund_requests_parent_auto_approve_check
  -- 와 같은 선례 — 본인 신청은 즉시 approved). responded_at 도 함께
  -- 세팅해야 orders_responded_at_pairing_check 를 통과한다. 쿠폰은 받지
  -- 않는다(coupon_id NULL, 범위 밖).
  insert into public.orders (
    id, user_id, student_profile_id, parent_profile_id, status, order_name,
    list_amount, discount_amount, amount, customer_email,
    approval_status, responded_at
  ) values (
    v_new_order_id, auth.uid(), v_order.student_profile_id, auth.uid(), 'pending', v_order_name,
    v_list_amount, v_discount_amount, v_subtotal, v_order.customer_email,
    'approved', now()
  );

  insert into public.order_items (order_id, product_id, product_slug, service_key, name, list_price, price, quantity)
  select
    v_new_order_id,
    p.id,
    p.slug,
    p.service_key,
    p.name,
    coalesce(p.list_price, p.price, 0),
    coalesce(p.price, 0),
    1
  from public.products p
  where p.id = any (v_product_ids)
    and p.is_active = true;

  -- 원래 요청 종결 — reject_reason 은 세팅하지 않는다(NULL 유지, 위 1)절
  -- CHECK 근거). status 는 canceled 로 내려 orders_approval_before_
  -- payment_check 를 통과시킨다.
  update public.orders
     set approval_status         = 'superseded',
         superseded_by_order_id  = v_new_order_id,
         status                  = 'canceled',
         responded_at            = now()
   where id = p_original_order_id;

  -- 형제 요청 대체 — sql/76 이 학생당 여러 서비스에 걸친 동시 열린 요청을
  -- 허용해서, 이번에 선택한 서비스와 겹치는 다른 열린 요청을 안 건드리면
  -- 그 요청이 나중에 독립적으로 승인될 때 같은 서비스가 중복 결제된다.
  update public.orders o
     set approval_status        = 'superseded',
         superseded_by_order_id = v_new_order_id,
         status                 = 'canceled',
         responded_at           = now()
   where o.student_profile_id = v_order.student_profile_id
     and o.status = 'pending'
     and o.approval_status = 'requested'
     and o.id <> p_original_order_id
     and exists (
       select 1 from public.order_items oi
        where oi.order_id = o.id
          and oi.service_key in (
            select distinct p.service_key
              from public.products p
             where p.id = any (v_product_ids)
               and p.is_active = true
          )
     );

  return query select v_new_order_id, v_subtotal, v_discount_amount;
end;
$$;

comment on function public.fn_parent_create_enrollment(text, jsonb) is
  '학부모가 학생의 미응답 수강신청 요청(status=pending, approval_status=requested)을 자신이 고른 상품 구성으로 대체해 즉시 approved 상태의 새 주문을 만든다(sql/85). 호출자는 그 주문의 parent_profile_id 여야 하고(WC052) 원래 요청이 여전히 미응답이어야 한다(WC053). fn_is_linked_pair 로 쌍을 재검증한다(WC055, sql/71 WC042 와 동일 헬퍼). 선택 상품은 is_active=true 인 것만 허용하며 하나라도 비활성/존재하지 않으면 거부한다(WC056). discount_amount 가 음수면 WC001 로 거부한다(orders_discount_amount_check 사전 방어). 대표 상품명(order_name)은 카탈로그 정렬(service_sort_order, sort_order)로 결정적으로 고른다. 새 주문은 쿠폰을 받지 않는다(coupon_id NULL, 범위 밖). 원래 주문은 approval_status=superseded·status=canceled·superseded_by_order_id=새 주문 id 로 종결된다 — reject_reason 은 세팅하지 않는다(orders_reject_reason_pairing_check 상 NULL 유지 필요), responded_at 은 함께 세팅한다(orders_responded_at_pairing_check 상 필수). 같은 학생의 다른 열린 요청(sql/76 이 허용하는, 다른 서비스에 걸친 동시 pending/requested 요청) 중 이번에 선택된 상품과 service_key 가 겹치는 것도 함께 superseded 처리해 나중에 독립 승인될 때 같은 서비스가 중복 결제되는 것을 막는다.';

revoke all on function public.fn_parent_create_enrollment(text, jsonb) from public, anon, service_role;
grant execute on function public.fn_parent_create_enrollment(text, jsonb) to authenticated;


-- =====================================================================
-- 5) SQLSTATE 배정 — WC051 부터(WC001~WC050 은 이미 배정됨, sql/71
--    7절·sql/74·sql/79 참고. invalid_amount 는 WC001 재사용).
-- =====================================================================
--   WC051  order_not_found                  fn_parent_create_enrollment
--                                            (신규): p_original_order_id
--                                            에 해당하는 주문 없음.
--   WC052  not_order_parent                 fn_parent_create_enrollment
--                                            (신규): 호출자가 그 주문의
--                                            parent_profile_id 가 아님.
--   WC053  order_not_pending_for_override    fn_parent_create_enrollment
--                                            (신규): 원래 요청이 이미
--                                            승인/반려/superseded 등으로
--                                            종결됨(status<>'pending' or
--                                            approval_status<>'requested').
--   WC054  no_items_selected                fn_parent_create_enrollment
--                                            (신규): p_items 가 비어있음.
--   WC055  pair_not_linked                  fn_parent_create_enrollment
--                                            (신규): fn_is_linked_pair
--                                            (student, 호출자) 가 false.
--   WC056  invalid_products                 fn_parent_create_enrollment
--                                            (신규): 요청한 고유 product_id
--                                            중 하나라도 존재하지 않거나
--                                            is_active=false.
--
--   변경 없음(재사용) — WC001(invalid_amount).
-- =====================================================================


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) WC053 — 이미 approved 된 주문에 대체 시도 → 거부.
--   -- 학부모 JWT 로 이미 fn_respond_enrollment 승인된 order_id 를 넣어
--   -- fn_parent_create_enrollment 호출 → WC053(order_not_pending_for_
--   -- override) 로 거부돼야 한다.
--
-- V2) 정상 흐름 — pending/requested 주문을 다른 상품 구성으로 대체.
--   -- 학생이 상품 A 로 fn_request_enrollment 요청 → 학부모 JWT 로
--   -- fn_parent_create_enrollment(원 order_id, [{product_id: B}]) 호출
--   -- → 새 order_id 반환, 그 주문 approval_status='approved'·
--   -- status='pending'. 원래 주문은 approval_status='superseded'·
--   -- status='canceled'·superseded_by_order_id=새 order_id.
--
-- V3) WC056 — 비활성 상품 포함 시 거부.
--   -- is_active=false 인 product_id 를 p_items 에 섞어 호출하면
--   -- WC056(invalid_products) 로 거부돼야 한다.
--
-- V4) WC055 — 연결되지 않은 학생의 주문에 호출 시 거부.
--   -- parent_child_links 가 없는(또는 revoked 된) 학생의 주문 id 로
--   -- 호출하면 WC055(pair_not_linked) 로 거부돼야 한다.
--
-- V5) CHECK 충돌 없음 확인.
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orders'::regclass
--    and conname in ('orders_approval_status_check',
--                     'orders_reject_reason_pairing_check',
--                     'orders_responded_at_pairing_check',
--                     'orders_approval_before_payment_check',
--                     'orders_superseded_pairing_check');
-- -- superseded 전환 후에도 위 5개 CHECK 가 전부 위반 없이 통과해야 한다.
--
-- V6) 형제 요청 동시 대체 — 학생이 서비스 A(주문 X, pending/requested)와
--   -- 서비스 B(주문 Y, pending/requested)를 각각 열어둔 상태에서, 학부모가
--   -- 주문 X 를 열어 서비스 A+B 상품을 함께 체크해 fn_parent_create_
--   -- enrollment(X, [A상품, B상품]) 호출 → X 뿐 아니라 Y 도 함께
--   -- approval_status='superseded'·superseded_by_order_id=새 order_id 로
--   -- 종결돼야 한다(겹치지 않는 service_key 를 가진 형제 주문은 손대지
--   -- 않아야 한다도 함께 확인).
--
-- V7) orders_superseded_pairing_check 위반 시도 — superseded_by_order_id
--   -- 를 채우지 않고 approval_status 만 'superseded' 로 직접 UPDATE 하면
--   -- (또는 그 반대) 23514 로 거부돼야 한다.
--
-- V8) WC001 — list_price < price 인 상품(할인율이 음수인 데이터)만으로
--   -- 호출하면 discount_amount < 0 이 돼 WC001(invalid_amount) 로
--   -- 거부돼야 한다(INSERT 까지 가지 않고 함수 안에서 먼저 걸러짐).
--
-- V9) order_name 결정성 — 같은 product_id 조합으로 여러 번 호출해도
--   -- (매번 다른 v_new_order_id 임에도) order_name 의 대표 상품명이
--   -- 항상 동일해야 한다(service_sort_order, sort_order 정렬 기준).
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- 2026-08-19 dev(gjowqdiopinhixfivnkx, 서울) 적용 + 검증 완료 — 함수/제약/
-- 컬럼/grant 구조 확인 + 트랜잭션 내 실제 RPC 호출(원 요청 대체, 형제
-- 요청 동시 superseded, 겹치지 않는 형제는 보존)까지 확인 후 rollback.
-- 2026-08-19 prod(ykrpjcsubmbenfcnwlzd, 서울, winningpage-prod) 적용 완료 —
-- dev와 동일 구조 확인(함수/제약/컬럼/grant). 런치 이후 정책 변경으로
-- dev 검증 통과 후 개별 마이그레이션을 prod에도 바로 적용한다
-- (기존 "운영은 dump 재생성으로만 반영" 방침은 런치 전 한정, 폐기됨).
-- =====================================================================
