-- fn_parent_create_enrollment(sql/85)에 is_orderable 게이트를 더한다. 이 함수는 학부모가
-- 학생의 미응답 수강신청 요청을 자신이 고른 상품 구성으로 대체하는 셀프서브 결제 경로라
-- products.is_orderable(20260825000000)의 세 검사 지점 — 개수 검증(WC056)/대표 상품명
-- 조회/형제 요청 대체(service_key 집합)에 각각 is_active=true 와 나란히 is_orderable=true를
-- 추가한다. 함수 본문은 baseline(20260821000000) 원문을 그대로 복사해 이 세 지점만
-- 최소 수정했다 — 다른 로직은 변경하지 않는다. is_orderable=false 상품을 고르면 기존
-- 비활성 상품과 동일하게 invalid_products(WC056)로 거부된다.
CREATE OR REPLACE FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") RETURNS TABLE("order_id" "text", "amount" integer, "discount_amount" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
     and p.is_active = true
     and p.is_orderable = true;

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
     and p.is_orderable = true
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
    and p.is_active = true
    and p.is_orderable = true;

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
               and p.is_orderable = true
          )
     );

  return query select v_new_order_id, v_subtotal, v_discount_amount;
end;
$$;


ALTER FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") IS '학부모가 학생의 미응답 수강신청 요청(status=pending, approval_status=requested)을 자신이 고른 상품 구성으로 대체해 즉시 approved 상태의 새 주문을 만든다(sql/85). 호출자는 그 주문의 parent_profile_id 여야 하고(WC052) 원래 요청이 여전히 미응답이어야 한다(WC053). fn_is_linked_pair 로 쌍을 재검증한다(WC055, sql/71 WC042 와 동일 헬퍼). 선택 상품은 is_active=true 이고 is_orderable=true 인 것만 허용하며 하나라도 비활성/주문불가/존재하지 않으면 거부한다(WC056, 20260825 is_orderable 게이트 추가). discount_amount 가 음수면 WC001 로 거부한다(orders_discount_amount_check 사전 방어). 대표 상품명(order_name)은 카탈로그 정렬(service_sort_order, sort_order)로 결정적으로 고른다. 새 주문은 쿠폰을 받지 않는다(coupon_id NULL, 범위 밖). 원래 주문은 approval_status=superseded·status=canceled·superseded_by_order_id=새 주문 id 로 종결된다 — reject_reason 은 세팅하지 않는다(orders_reject_reason_pairing_check 상 NULL 유지 필요), responded_at 은 함께 세팅한다(orders_responded_at_pairing_check 상 필수). 같은 학생의 다른 열린 요청(sql/76 이 허용하는, 다른 서비스에 걸친 동시 pending/requested 요청) 중 이번에 선택된 상품과 service_key 가 겹치는 것도 함께 superseded 처리해 나중에 독립 승인될 때 같은 서비스가 중복 결제되는 것을 막는다.';
