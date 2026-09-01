-- 부산캠퍼스 번들 상품 2/4 — products org·기한 축 + 신청 함수 서버 검증
--
-- 왜: "부산캠퍼스 특별할인" 은 org 한정(소속 확인 없이는 결제 불가) +
-- 판매 마감일 + 학생당 1회 구매 제한이 걸린 상품이다. 쿠폰(coupons.
-- org_code, 20260831020402)과 같은 축을 상품에도 둔다 — 판정 헬퍼도
-- fn_coupon_org_matches 와 동일 본문을 재사용한다(대칭 유지).

-- ---------------------------------------------------------------------
-- 1) products.org_code / sale_ends_at
-- ---------------------------------------------------------------------

alter table public.products
  add column if not exists org_code text;

alter table public.products
  drop constraint if exists products_org_code_normalized_check;

alter table public.products
  add constraint products_org_code_normalized_check
  check (org_code is null or org_code = upper(trim(org_code)));

comment on column public.products.org_code is
  '소속 한정 상품 축(2026-09-01, 쿠폰 coupons.org_code 와 동일 원칙). NULL 이면 소속 제한 없음. 값이 있으면 학생 또는 학부모의 profiles.org_code 가 이 값과 같아야 구매 가능 — 판정은 fn_product_org_matches. 항상 upper(trim()) 정규화 상태로 저장(CHECK 로 강제).';

alter table public.products
  add column if not exists sale_ends_at timestamptz;

comment on column public.products.sale_ends_at is
  '판매 마감 시각(2026-09-01). NULL 이면 마감 없음. now() >= sale_ends_at 이면 신청 함수(fn_request_enrollment·fn_parent_create_enrollment)가 거부한다(WC065) — 카탈로그 노출 여부는 이 컬럼과 별개로 프론트/조회 쿼리가 판단한다.';

-- ---------------------------------------------------------------------
-- 2) fn_product_org_matches — fn_coupon_org_matches 와 동일 본문
-- ---------------------------------------------------------------------

create or replace function public.fn_product_org_matches(
  p_org_code text,
  p_student uuid,
  p_parent uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_org_code is null
    or exists (
      select 1
      from public.profiles p
      where p.id in (p_student, p_parent)
        and p.org_code is not null
        and upper(trim(p.org_code)) = p_org_code
    );
$$;

comment on function public.fn_product_org_matches(text, uuid, uuid) is
  '소속 한정 상품 판정(2026-09-01, fn_coupon_org_matches 와 동일 본문). p_org_code 가 NULL 이면 항상 true. 아니면 학생(p_student) 또는 학부모(p_parent) 중 하나라도 profiles.org_code 가 그 값과 같으면 true(쌍 OR).';

revoke all on function public.fn_product_org_matches(text, uuid, uuid) from public;
grant execute on function public.fn_product_org_matches(text, uuid, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) fn_matched_org_codes — 로그인 사용자의 org_code 목록(프론트 노출 필터용)
-- ---------------------------------------------------------------------

create or replace function public.fn_matched_org_codes(
  p_student_profile_id uuid default null
)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_codes  text[];
begin
  if v_caller is null then
    return '{}';
  end if;

  select coalesce(array_agg(distinct upper(trim(code))), '{}')
    into v_codes
    from (
      -- 본인.
      select p.org_code as code
        from public.profiles p
       where p.id = v_caller and p.org_code is not null

      union all

      -- parent_child_links 로 연결된(approved) 상대 전원.
      select p.org_code as code
        from public.parent_child_links l
        join public.profiles p
          on p.id = case when l.parent_id = v_caller then l.student_id
                         when l.student_id = v_caller then l.parent_id
                    end
       where l.status = 'approved'
         and (l.parent_id = v_caller or l.student_id = v_caller)
         and p.org_code is not null

      union all

      -- p_student_profile_id 가 주어지고 호출자와 연결돼 있으면 그 학생.
      select p.org_code as code
        from public.profiles p
       where p_student_profile_id is not null
         and p.id = p_student_profile_id
         and p.org_code is not null
         and public.fn_is_linked_pair(v_caller, p_student_profile_id)
    ) as codes;

  return v_codes;
end;
$$;

comment on function public.fn_matched_org_codes(uuid) is
  '로그인 사용자(auth.uid())가 소속으로 확인받을 수 있는 org_code 목록(2026-09-01, 프론트 노출 필터용 — "이 org 한정 상품을 카탈로그에 보여줄까" 판단 재료). 본인 + parent_child_links 로 연결된(approved) 상대 전원 + p_student_profile_id 로 지정된, 호출자와 연결된 학생의 org_code 를 upper(trim) 정규화해 중복 제거 배열로 반환한다. 비로그인은 빈 배열. 실제 구매 가능 여부 판정은 fn_product_org_matches 가 별도로 한다(이 함수는 표시 전용, 서버 검증 대체 아님).';

revoke all on function public.fn_matched_org_codes(uuid) from public;
grant execute on function public.fn_matched_org_codes(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4) fn_request_enrollment — 신청 시점 상품 검증
--
--    baseline(20260821000000:2556) 원문에서 바뀌는 곳은 하나뿐이다 —
--    orders/order_items INSERT 사이에 p_items 의 product_id 를 products
--    와 조인해 org_code/sale_ends_at/구매 이력을 검사하는 루프를
--    더했다. 나머지(WC019·WC020·WC042·WC001·advisory lock)는 원문 그대로.
-- ---------------------------------------------------------------------

create or replace function public.fn_request_enrollment(
  p_order_id text,
  p_student_profile_id uuid,
  p_parent_profile_id uuid,
  p_customer_email text,
  p_order_name text,
  p_items jsonb,
  p_list_amount integer,
  p_subtotal integer
) returns table(order_id text, amount integer, discount_amount integer)
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_discount_amount integer;
  v_amount          integer;
  v_prod            record;
begin
  if p_order_id is null or p_subtotal is null or p_list_amount is null then
    raise exception 'order_id/list_amount/subtotal required';
  end if;

  if p_student_profile_id is null or p_parent_profile_id is null then
    raise exception 'enrollment_pair_required' using errcode = 'WC019';
  end if;
  if p_student_profile_id = p_parent_profile_id then
    raise exception 'enrollment_pair_same_profile' using errcode = 'WC020';
  end if;

  -- 학생 축 advisory lock 유지(sql/71) — 동시에 들어온 같은 학생의 요청을
  -- 직렬화한다. 학부모 축이 아니라 학생 축인 이유는 한 학부모가 여러 자녀를
  -- 동시에 신청시키는 정상 흐름까지 직렬화하지 않기 위해서다.
  perform pg_advisory_xact_lock(hashtextextended(p_student_profile_id::text, 101));

  if not public.fn_is_linked_pair(p_student_profile_id, p_parent_profile_id) then
    raise exception 'pair_not_linked' using errcode = 'WC042';
  end if;

  -- ⚠ 여기 있던 WC043(중복 열린 요청 차단) EXISTS 블록을 제거했다.
  --   파일 상단 "왜 되돌리나" 참고.

  -- 신규(2026-09-01) — org 한정 상품 서버 검증. p_items 는 클라이언트가
  -- 넘긴다(이 함수는 auth.uid() 를 참조하지 않는다 — 신뢰 경계는 호출부
  -- api/request-enrollment.js) 그래도 org_code/sale_ends_at/구매 이력은
  -- 여기서 products 를 직접 조회해 재검증한다.
  for v_prod in
    select p.id as product_id, p.org_code, p.sale_ends_at
      from public.products p
     where p.id in (
       select (it ->> 'product_id')::uuid
         from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it
     )
       and (p.org_code is not null or p.sale_ends_at is not null)
  loop
    if v_prod.org_code is not null
       and not public.fn_product_org_matches(
             v_prod.org_code, p_student_profile_id, p_parent_profile_id) then
      raise exception 'product_org_mismatch' using errcode = 'WC064';
    end if;

    if v_prod.sale_ends_at is not null and now() >= v_prod.sale_ends_at then
      raise exception 'product_sale_ended' using errcode = 'WC065';
    end if;

    if v_prod.org_code is not null and exists (
      select 1
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
       where o.student_profile_id = p_student_profile_id
         and o.status in ('paid', 'waiting_deposit')
         and oi.product_id = v_prod.product_id
    ) then
      raise exception 'product_purchase_limit' using errcode = 'WC066';
    end if;
  end loop;

  v_discount_amount := p_list_amount - p_subtotal;
  v_amount          := p_subtotal;

  if v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'WC001';
  end if;

  insert into public.orders
    (id, user_id, student_profile_id, parent_profile_id, status, order_name,
     list_amount, discount_amount, amount, customer_email)
  values
    (p_order_id, p_parent_profile_id, p_student_profile_id, p_parent_profile_id,
     'pending', p_order_name, p_list_amount, v_discount_amount, v_amount, p_customer_email);

  insert into public.order_items
    (order_id, product_id, product_slug, service_key, name, list_price, price, quantity)
  select
    p_order_id,
    (it->>'product_id')::uuid,
    it->>'product_slug',
    it->>'service_key',
    it->>'name',
    coalesce((it->>'list_price')::integer, 0),
    coalesce((it->>'price')::integer, 0),
    coalesce((it->>'quantity')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it;

  return query
    select p_order_id, v_amount, v_discount_amount;
end;
$$;

comment on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer) is
  '학생이 수강신청(주문)을 생성한다(sql/76 — WC043 중복 열린 요청 차단 제거, 2026-08-13 사용자 확정 + 2026-09-01 org 한정 상품 서버 검증). 한 학생이 승인 대기 요청을 여러 건 가질 수 있다. 동시 이중 신청 방지는 학생 축 advisory lock(salt 101)이 계속 담당한다. p_items 의 product_id 가 org_code/sale_ends_at 을 가진 상품이면 소속 불일치(WC064)·판매 마감(WC065)·학생당 1회 구매 제한 초과(WC066)를 여기서 재검증한다(클라이언트가 넘긴 p_items 를 신뢰하지 않는다). 나머지 가드(쌍 필수 WC019·동일인 금지 WC020·링크 검증 WC042·0원 이하 WC001)는 sql/71 원문과 동일하다. auth.uid() 는 참조하지 않는다 — 신뢰 경계는 호출자(api/request-enrollment.js)다.';

-- ---------------------------------------------------------------------
-- 5) fn_parent_create_enrollment — 신청 시점 상품 검증
--
--    20260825000001(is_orderable 게이트) 최신본에서 바뀌는 곳은 하나뿐
--    이다 — 개수 검증(WC056) 뒤에 org_code/sale_ends_at/구매 이력 검사
--    루프를 더했다. 나머지(WC051~056·is_orderable 게이트·형제 요청
--    대체)는 원문 그대로.
-- ---------------------------------------------------------------------

create or replace function public.fn_parent_create_enrollment(
  p_original_order_id text,
  p_items jsonb
) returns table(order_id text, amount integer, discount_amount integer)
language plpgsql security definer
set search_path to 'public', 'pg_temp'
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
  v_prod            record;
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

  -- 신규(2026-09-01) — org 한정 상품 서버 검증(fn_request_enrollment 와
  -- 동일 축). 이 경로의 학부모는 auth.uid(), 학생은 v_order.student_
  -- profile_id.
  for v_prod in
    select p.id as product_id, p.org_code, p.sale_ends_at
      from public.products p
     where p.id = any (v_product_ids)
       and (p.org_code is not null or p.sale_ends_at is not null)
  loop
    if v_prod.org_code is not null
       and not public.fn_product_org_matches(
             v_prod.org_code, v_order.student_profile_id, auth.uid()) then
      raise exception 'product_org_mismatch' using errcode = 'WC064';
    end if;

    if v_prod.sale_ends_at is not null and now() >= v_prod.sale_ends_at then
      raise exception 'product_sale_ended' using errcode = 'WC065';
    end if;

    if v_prod.org_code is not null and exists (
      select 1
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
       where o.student_profile_id = v_order.student_profile_id
         and o.status in ('paid', 'waiting_deposit')
         and oi.product_id = v_prod.product_id
    ) then
      raise exception 'product_purchase_limit' using errcode = 'WC066';
    end if;
  end loop;

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

comment on function public.fn_parent_create_enrollment(text, jsonb) is
  '학부모가 학생의 미응답 수강신청 요청(status=pending, approval_status=requested)을 자신이 고른 상품 구성으로 대체해 즉시 approved 상태의 새 주문을 만든다(sql/85 + 20260825 is_orderable 게이트 + 2026-09-01 org 한정 상품 서버 검증). 호출자는 그 주문의 parent_profile_id 여야 하고(WC052) 원래 요청이 여전히 미응답이어야 한다(WC053). fn_is_linked_pair 로 쌍을 재검증한다(WC055, sql/71 WC042 와 동일 헬퍼). 선택 상품은 is_active=true 이고 is_orderable=true 인 것만 허용하며 하나라도 비활성/주문불가/존재하지 않으면 거부한다(WC056). org_code/sale_ends_at 을 가진 상품이면 소속 불일치(WC064)·판매 마감(WC065)·학생당 1회 구매 제한 초과(WC066)를 재검증한다. discount_amount 가 음수면 WC001 로 거부한다(orders_discount_amount_check 사전 방어). 대표 상품명(order_name)은 카탈로그 정렬(service_sort_order, sort_order)로 결정적으로 고른다. 새 주문은 쿠폰을 받지 않는다(coupon_id NULL, 범위 밖). 원래 주문은 approval_status=superseded·status=canceled·superseded_by_order_id=새 주문 id 로 종결된다 — reject_reason 은 세팅하지 않는다(orders_reject_reason_pairing_check 상 NULL 유지 필요), responded_at 은 함께 세팅한다(orders_responded_at_pairing_check 상 필수). 같은 학생의 다른 열린 요청(sql/76 이 허용하는, 다른 서비스에 걸친 동시 pending/requested 요청) 중 이번에 선택된 상품과 service_key 가 겹치는 것도 함께 superseded 처리해 나중에 독립 승인될 때 같은 서비스가 중복 결제되는 것을 막는다.';
