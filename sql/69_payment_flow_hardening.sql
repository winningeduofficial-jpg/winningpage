-- =====================================================================
-- 69_payment_flow_hardening.sql
-- 결제 플로우 BLOCK 해소 — 13에이전트 비관 감사(sql/68 적용 후 dev 실측·
-- 재현)에서 확정된 R2/R3/R4/R5/R7 뿌리를 닫는다.
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 (2026-08-12 팀 리드 지시, sql/68 적용 후 dev(gjowqdiopinhixfivnkx)
-- 실측·재현으로 확정)
--
--   R2 — 승인 게이트 3층 부재. fn_grant_program_access_for_order 가
--     orders.status/approval_status 를 전혀 보지 않아 반려(canceled)된
--     주문에도 권한이 전부 나간다. api/confirm-payment.js 는 orders UPDATE
--     실패를 로그만 하고 부여를 계속 실행한다(api 배선은 다음 단계 —
--     이 파일은 DB 쪽 백스톱만 닫는다). status='failed' 기록도
--     orders_approval_before_payment_check 에 막혀 미승인 주문이 영구
--     pending 으로 남는다(내 설계 오류).
--
--   R3 — 환불 완료가 아무 부작용도 없는 제네릭 PATCH. refund_requests.
--     status='completed' 를 만드는 유일 경로가 어드민 화면의 PostgREST
--     테이블 편집기라 (i) 이중 환불 무제한 (ii) 권한 미회수(계좌이체·
--     수기 환불) (iii) 소비 재판정 없음 세 갈래가 열려 있다.
--
--   R4 — 쿠폰 판정 축이 '승인 대기'(수 시간~수일)와 어긋난다. 요청
--     시점에 쿠폰을 확정하면 fn_coupon_is_redeemed/fn_coupon_global_
--     redeemed 의 30분 소프트 홀드(원래 결제창 이탈용)에 걸려 초과
--     발행·하드 500·쿠폰 영구 소멸·수락 영구 불가 4종이 난다.
--
--   R5 — 승인축/처리축 단절. fn_respond_refund 반려가 approval_status=
--     'rejected' + status='requested' 로 남기는데, refund_requests_
--     approval_before_processing_check 가 그 status 를 'requested' 에
--     못박아 어드민이 그 행을 어디로도 못 옮긴다(내 설계 오류).
--
--   R7 — 판정 근거가 원장 아닌 캐시. fn_grant_program_access_for_order 의
--     revoked_not_restored 가드가 program_access 캐시(profile, program_key
--     단위)를 본다 — 같은 program_key 에 다른 살아있는 부여가 있으면
--     캐시가 가려 회수 사실을 놓치고(뚫림), 반대로 다른 주문의 회수가
--     남긴 캐시가 새 주문 부여를 근거 없이 막는다.
--
-- 사용자 확정 (이번 변경의 근거, R4 를 구조로 없앤다)
--   쿠폰은 학부모 결제(수락) 단계에서 적용한다. 학생은 상품만 고른다
--   (시안 함의 — 학생 서비스 선택 화면에 쿠폰 UI 가 없다). 요청 시점엔
--   쿠폰이 없으므로 30분 소프트 홀드가 원래 의도(결제창 이탈)대로 맞는다.
--
-- ---------------------------------------------------------------------
-- 이 파일이 하지 않는 것 (명시적 제외)
-- ---------------------------------------------------------------------
--   · api/create-order.js·api/confirm-payment.js·api/toss-webhook.js 등
--     호출부 수정 — 다음 단계(api 배선, 별도 작업). fn_request_enrollment
--     신설·fn_redeem_coupons DROP·fn_respond_enrollment 시그니처 변경이
--     바뀐 지점을 아래 보고에 명시한다. 2)절 fn_grant_program_access_
--     for_order 는 시그니처가 그대로라 호출부 변경이 필요 없다.
--   · 운영 DB 접근 — 이 작업 범위에서 읽기조차 하지 않았다.
--   · DB 적용 — 파일만 쓴다. 적용·검증은 팀 리드가 한다.
--   · sql/68 수정 — 이미 dev 에 적용됐다. 변경은 전부 이 새 파일에서 한다.
-- =====================================================================


-- =====================================================================
-- 1) 쿠폰 확정 시점을 '요청' → '수락' 으로 이동 (R4 해소)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1-a) fn_request_enrollment 신설 — 쿠폰 없이 주문만 만든다.
--    sql/68 fn_redeem_coupons(5-d절)에서 쌍 가드·orders/order_items INSERT
--    (쿠폰 관련 전부 제외)를 그대로 옮긴다. advisory lock 불필요(쿠폰이
--    없으므로 이중 소진 경합 자체가 없다) — 넣지 않는다.
--
--    금액 — discount_amount = p_list_amount - p_subtotal(상품 단위 할인,
--    쿠폰분 0), amount = p_subtotal. orders_amount_balance_check(amount =
--    list_amount - discount_amount) 를 대입하면
--      p_subtotal = p_list_amount - (p_list_amount - p_subtotal) = p_subtotal
--    로 항상 성립한다. orders.discount_amount 가 "상품 할인 + 쿠폰 할인의
--    합"이라는 건 sql/55_coupon_policy.sql:182-193 에 이미 문서화된
--    불변식이다(감사·표시 쿼리가 그 분해를 전제로 한다) — 여기서 discount_
--    amount 를 0 으로 놓으면 그 불변식과 orders_amount_balance_check 가
--    동시에 깨진다(list_amount ≠ subtotal 인 모든 경우, 즉 상품 판매가가
--    정가보다 낮은 모든 경우). 아래 5)절 fn_respond_enrollment 는 승인
--    시점에 이 값에 쿠폰 할인을 "더한다"(교체 아님) — 그래야 두 시점의
--    discount_amount 가 계속 같은 뜻을 유지한다.
-- ---------------------------------------------------------------------
create or replace function public.fn_request_enrollment(
  p_order_id           text,
  p_student_profile_id uuid,
  p_parent_profile_id  uuid,
  p_customer_email     text,
  p_order_name         text,
  p_items              jsonb,    -- [{product_id, product_slug, service_key, name, list_price, price, quantity}]
  p_list_amount        integer,
  p_subtotal           integer   -- products 합산 판매가 (쿠폰 적용 전, 상품 할인 반영 후)
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
  v_discount_amount integer;
  v_amount          integer;
begin
  if p_order_id is null or p_subtotal is null or p_list_amount is null then
    raise exception 'order_id/list_amount/subtotal required';
  end if;

  -- 쌍 필수 + 동일인 금지. orders_pair_distinct_check 가 결국 같은 것을
  -- 막지만, INSERT 시점의 원문 23514 보다 여기서 먼저 걸러 원인이 분명한
  -- 코드로 알린다(sql/68 5-d절과 동일 근거로 여기 그대로 옮김).
  if p_student_profile_id is null or p_parent_profile_id is null then
    raise exception 'enrollment_pair_required' using errcode = 'WC019';
  end if;
  if p_student_profile_id = p_parent_profile_id then
    raise exception 'enrollment_pair_same_profile' using errcode = 'WC020';
  end if;

  v_discount_amount := p_list_amount - p_subtotal;
  v_amount          := p_subtotal;

  -- 0원 이하 주문 차단 — orders_amount_check(amount > 0)가 있으니 그
  -- 원문 23514 대신 여기서 먼저 명확한 코드로 막는다(sql/68 fn_redeem_
  -- coupons WC001 과 동일 어휘 재사용).
  if v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'WC001';
  end if;

  -- 주문 헤더. approval_status/requested_at 은 컬럼 DEFAULT('requested'/
  -- now())를 그대로 받는다 — 학부모 수락 전까지는 orders_approval_before_
  -- payment_check 가 이 주문을 pending 밖으로 못 나가게 막는다.
  -- coupon_id 는 이 시점엔 없다(NULL) — 수락 시 fn_respond_enrollment 가 채운다.
  insert into public.orders
    (id, user_id, student_profile_id, parent_profile_id, status, order_name,
     list_amount, discount_amount, amount, customer_email)
  values
    (p_order_id, p_parent_profile_id, p_student_profile_id, p_parent_profile_id,
     'pending', p_order_name, p_list_amount, v_discount_amount, v_amount, p_customer_email);

  -- 주문 아이템 — sql/68 fn_redeem_coupons 원문과 동일.
  insert into public.order_items (order_id, product_id, product_slug, service_key, name, list_price, price, quantity)
  select
    p_order_id,
    (i ->> 'product_id')::uuid,
    i ->> 'product_slug',
    i ->> 'service_key',
    i ->> 'name',
    coalesce((i ->> 'list_price')::integer, 0),
    coalesce((i ->> 'price')::integer, 0),
    coalesce((i ->> 'quantity')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i;

  return query select p_order_id, v_amount, v_discount_amount;
end;
$$;

comment on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer) is
  '서버 전용(service_role). 학생이 수강신청(주문)을 만든다 — 쿠폰은 이 시점에 없다(R4 해소, 2026-08-12 사용자 확정: 쿠폰은 학부모 결제 단계에서 적용). 쌍 필수(WC019)·동일인 금지(WC020)·0원 차단(WC001)은 sql/68 fn_redeem_coupons 와 동일 어휘. discount_amount = list_amount - subtotal(상품 단위 할인만, 쿠폰분 0) — orders.discount_amount 가 "상품 할인 + 쿠폰 할인의 합"이라는 불변식(sql/55_coupon_policy.sql:182-193)을 유지한다. amount = subtotal. advisory lock 없음(쿠폰이 없어 경합 없음). 쿠폰 확정은 5)절 fn_respond_enrollment 가 한다.';

revoke all on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer)
  to service_role;


-- ---------------------------------------------------------------------
-- 1-b) fn_redeem_coupons DROP — 더 이상 쓰지 않는다. 쿠폰 관련 로직은
--    전부 5)절 fn_respond_enrollment 로 이관됐고, 쌍+주문 생성은 위
--    1-a) fn_request_enrollment 가 대신한다. 명시적으로 DROP 해서 오버로드
--    잔존을 막는다 — pg_get_function_identity_arguments 는 default 를
--    숨겨 그대로 쓰면 42P13 이 나므로(sql/68 5-h절과 동일 경고) 인자를
--    직접 명시한다.
-- ---------------------------------------------------------------------
drop function if exists public.fn_redeem_coupons(text, uuid, uuid, text, text, jsonb, integer, integer, uuid[]);


-- ---------------------------------------------------------------------
-- 1-c) fn_coupon_is_redeemed / fn_coupon_global_redeemed — 제외 축을
--    voided_at 하나로 통일(2026-08-12b 팀 리드 지시, 재작업).
--
--    처음엔 제외 목록에 'canceled' 만 추가했으나, dev E2E 에서 23505 로
--    실패가 재현됐다 — 판정 함수(상태 기반: failed/canceled/시간창 초과
--    pending 제외)와 DB 백스톱 인덱스(coupon_redemptions_single_use_uidx,
--    voided_at 기반)가 서로 다른 축을 봐서 "판정은 재사용 가능인데
--    인덱스가 막는다"가 났다. 인덱스 predicate 는 같은 행의 컬럼만 볼 수
--    있어 orders.status 를 참조할 수 없다 — 이 구조적 불일치는 13에이전트
--    감사가 R4 "하드 500" 표면으로 이미 지목한 것과 같고, failed 제외도
--    sql/55 시절부터 같은 결함을 잠복시키고 있었다.
--
--    해법 — 상태로 "제외"를 추론하지 않고, 상태 전이 시점에 voided_at 을
--    명시적으로 기록한다(아래 1-e절 트리거 + 1-f절 fn_respond_enrollment
--    lazy 정리). 이 두 함수는 이제 voided_at is null 만 본다 — orders
--    조인을 제거한다(더 이상 필요 없다). signature/반환 타입 변경 없음.
--    p_at/p_exclude_order_id 인자는 시그니처 호환을 위해 남기지만 본문
--    에서는 더 이상 시간 비교를 하지 않는다(그 비교는 1-f절 lazy 정리로
--    옮겨갔다).
-- ---------------------------------------------------------------------
create or replace function public.fn_coupon_is_redeemed(
  p_coupon_id         uuid,
  p_user_id           uuid,
  p_at                timestamptz default now(),
  p_exclude_order_id  text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      with c as (
        select max_uses_per_user
        from public.coupons
        where id = p_coupon_id
      ),
      used as (
        select count(*) as cnt
        from public.coupon_redemptions cr
        where cr.coupon_id = p_coupon_id
          and p_user_id is not null
          and cr.user_id = p_user_id
          and cr.voided_at is null
          and (p_exclude_order_id is null or cr.order_id <> p_exclude_order_id)
      )
      select
        p_user_id is not null
        and c.max_uses_per_user is not null
        and used.cnt >= c.max_uses_per_user
      from c, used
    ),
    true
  );
$$;

comment on function public.fn_coupon_is_redeemed(uuid, uuid, timestamptz, text) is
  '소진 판정 내부 헬퍼(sql/69 1-c절 재작성 — 제외 축을 voided_at 하나로 통일). 이전엔 orders.status 를 조인해 상태로 제외를 추론했는데, DB 백스톱 인덱스(coupon_redemptions_single_use_uidx)는 voided_at 만 볼 수 있어 두 축이 갈렸다(dev E2E 23505 재현). 이제 voided_at is null 인 행만 "살아있는 사용"으로 센다 — 종결(canceled/failed) 전이는 1-e절 트리거가, 30분 소프트 홀드 만료는 1-f절 fn_respond_enrollment 의 lazy 정리가 voided_at 을 명시적으로 채워 이 정의를 유지한다. p_at 은 시그니처 호환용으로 남겼으나 본문에서 더 이상 쓰지 않는다.';

revoke all on function public.fn_coupon_is_redeemed(uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.fn_coupon_is_redeemed(uuid, uuid, timestamptz, text) to service_role;

create or replace function public.fn_coupon_global_redeemed(
  p_coupon_id         uuid,
  p_at                timestamptz default now(),
  p_exclude_order_id  text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      with c as (
        select max_redemptions
        from public.coupons
        where id = p_coupon_id
      ),
      used as (
        select count(*) as cnt
        from public.coupon_redemptions cr
        where cr.coupon_id = p_coupon_id
          and cr.voided_at is null
          and (p_exclude_order_id is null or cr.order_id <> p_exclude_order_id)
      )
      select
        c.max_redemptions is not null
        and used.cnt >= c.max_redemptions
      from c, used
    ),
    true
  );
$$;

comment on function public.fn_coupon_global_redeemed(uuid, timestamptz, text) is
  '전체 발행량(max_redemptions) 소진 판정(sql/69 1-c절 재작성 — voided_at 단일 축). fn_coupon_is_redeemed 와 동일 근거로 orders 조인을 제거했다 — 드리프트 방지.';

revoke all on function public.fn_coupon_global_redeemed(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.fn_coupon_global_redeemed(uuid, timestamptz, text) to service_role;


-- ---------------------------------------------------------------------
-- 1-d) fn_coupon_pending_hold_minutes — 30분 소프트 홀드 상수를 한 곳으로.
--    sql/55 원문(fn_coupon_is_redeemed/fn_coupon_global_redeemed 안에
--    `interval '30 minutes'` 리터럴, sql/55_coupon_policy.sql:1053/1107)
--    은 1-c절에서 제거됐다 — 그 창을 이제 1-f절 fn_respond_enrollment 의
--    lazy 정리 하나가 쓴다. 사용처가 하나뿐이어도 매직 리터럴로 심지
--    않는다 — 나중에 스케줄 정리 잡 등 두 번째 사용처가 생겨도 숫자가
--    갈리지 않도록 함수로 뺀다(팀 리드 지시: "두 곳에 30분을 손으로
--    적으면 갈린다").
-- ---------------------------------------------------------------------
create or replace function public.fn_coupon_pending_hold_minutes()
returns integer
language sql
immutable
as $$
  select 30;
$$;

comment on function public.fn_coupon_pending_hold_minutes() is
  '결제창 이탈로 보는 pending 주문의 쿠폰 소프트 홀드 창(분). sql/55 원문 리터럴(interval ''30 minutes'', sql/55_coupon_policy.sql:1053/1107)을 이관한 단일 정본 — fn_respond_enrollment(1-f절) 의 lazy 정리가 이 값을 쓴다(sql/69).';

revoke all on function public.fn_coupon_pending_hold_minutes() from public, anon, authenticated;
grant execute on function public.fn_coupon_pending_hold_minutes() to service_role;


-- ---------------------------------------------------------------------
-- 1-e) orders_void_coupons_on_terminal_status 트리거(신설) — 종결 상태
--    전이 시 그 주문의 살아있는 coupon_redemptions 를 자동으로 void.
--
--    취소를 만드는 경로가 여럿이다(학부모 반려·결제 실패·토스 취소
--    웹훅·어드민) — 경로를 다 찾아 고치는 대신 orders.status 전이
--    자체에 트리거를 걸어 누락을 구조적으로 없앤다.
--
--    대상: status 가 'canceled' 또는 'failed' 로 "바뀌는" 순간(AFTER
--    UPDATE OF status, new<>old)만 — 이미 그 상태인 행을 다시 UPDATE
--    해도 재실행되지 않는다.
--
--    'refunded' 는 대상이 아니다 — sql/55_coupon_policy.sql:104-112 가
--    "전액 환불 시 쿠폰 복원은 운영자가 voided_at 으로 명시적으로
--    한다"를 확정 정책으로 못박았다(팀 리드 지시, 이번 감사에서도 같은
--    근거로 재확인됨). 자동 void 하지 않는다.
--
--    SECURITY DEFINER — orders.status 를 바꾸는 경로가 service_role
--    (webhook)·SECURITY DEFINER RPC(fn_respond_enrollment) 뿐이라 사실상
--    항상 상위 컨텍스트가 이미 RLS 를 우회하지만, 이 void 기록은 "누가
--    상태를 바꿨는가"와 무관하게 항상 성립해야 하는 시스템 불변식이라
--    호출자의 coupon_redemptions RLS 권한에 기대지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.orders_void_coupons_on_terminal_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('canceled', 'failed') then
    update public.coupon_redemptions
       set voided_at   = now(),
           void_reason = case new.status
                            when 'canceled' then 'order_canceled'
                            when 'failed'   then 'order_failed'
                          end
     where order_id = new.id
       and voided_at is null;
  end if;
  return new;
end;
$$;

comment on function public.orders_void_coupons_on_terminal_status() is
  'orders.status 가 canceled/failed 로 전이되는 순간 그 주문의 살아있는(voided_at is null) coupon_redemptions 를 자동 void 한다(void_reason=order_canceled/order_failed). refunded 는 제외(sql/55_coupon_policy.sql:104-112 확정 정책 — 환불 쿠폰 복원은 운영자가 수기로 한다). fn_coupon_is_redeemed/fn_coupon_global_redeemed(1-c절)가 voided_at 단일 축으로 바뀌면서 이 트리거가 그 축의 유일한 자동 기록원 중 하나가 됐다(다른 하나는 1-f절 30분 lazy 정리).';

drop trigger if exists orders_void_coupons_on_terminal_status_trg on public.orders;
create trigger orders_void_coupons_on_terminal_status_trg
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status and new.status in ('canceled', 'failed'))
  execute function public.orders_void_coupons_on_terminal_status();


-- ---------------------------------------------------------------------
-- 1-f) fn_respond_enrollment 재작성 : 수락 시 쿠폰을 확정한다.
--    학부모 응답 게이트(WC021~WC023/WC025)는 sql/68 원문 그대로다. 쿠폰
--    판정 블록(sql/68 5-d절 fn_redeem_coupons 의 "1) 쿠폰 판정"~"6-b) 귀속"
--    전체)을 여기로 그대로 옮긴다 — v_order.student_profile_id/parent_
--    profile_id 를 쌍 축으로, v_order.amount(요청 시점 subtotal, 쿠폰
--    미적용)를 subtotal 축으로 쓴다.
--
--    fn_revalidate_order_coupons 호출 제거 — 방금 이 자리에서 쿠폰을
--    직접 확정했으므로 재검증이 의미가 없다(팀 리드 지시). WC024 는
--    폐기(아래 SQLSTATE 표에 폐기 표시로 남긴다).
--
--    sql/68 의 3인자 signature 를 명시적으로 제거한다 — create or replace
--    는 인자 목록이 다르면 교체가 아니라 신규 생성이라 오버로드가
--    공존하고, 둘 다 뒤쪽 인자에 default 가 있어 2·3인자 호출이
--    42725(not unique)로 죽는다(dev 적용에서 실제 발생, 팀 리드 실측 —
--    학부모 수락 100% 실패 + 폐기된 WC024 재검증 경로가 구버전으로 되살아남).
--    pg_get_function_identity_arguments 는 default 를 숨기므로 인자
--    타입만 명시한다(42P13 회피).
-- ---------------------------------------------------------------------
drop function if exists public.fn_respond_enrollment(text, boolean, text);

create or replace function public.fn_respond_enrollment(
  p_order_id      text,
  p_approve       boolean,
  p_reject_reason text default null,
  p_coupon_ids    uuid[] default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order              public.orders;
  v_now                timestamptz := now();
  v_coupon             record;
  v_coupon_discount    integer := 0;
  v_applied_ids        uuid[] := '{}';
  v_applied_discounts  integer[] := '{}';
  -- 그 쿠폰이 귀속될 소유자 — granted 는 학생 또는 학부모, auto 는 항상
  -- NULL. v_cand_*/v_applied_* 는 항상 같은 인덱스로 append 된다(sql/68
  -- 5-d절과 동일 정합 원칙).
  v_applied_owners     uuid[] := '{}';
  v_cand_ids           uuid[] := '{}';
  v_cand_discounts     integer[] := '{}';
  v_cand_stackable     boolean[] := '{}';
  v_cand_owners        uuid[] := '{}';
  v_owner              uuid;
  v_best_nonstack_idx  integer;
  v_i                  integer;
  v_subtotal           integer;
  v_new_discount_total integer;
  v_new_amount         integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC021';
  end if;

  if v_order.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_order_parent' using errcode = 'WC022';
  end if;

  if v_order.approval_status <> 'requested' then
    raise exception 'enrollment_not_pending' using errcode = 'WC023';
  end if;

  if p_approve then
    -- 요청 시점(fn_request_enrollment) 의 orders.amount 는 쿠폰 미적용
    -- subtotal 이다(1-a절 근거) — 여기서 그 값을 subtotal 정본으로 쓴다
    -- (sql/68 fn_redeem_coupons 의 p_subtotal 자리와 동일 역할).
    v_subtotal := v_order.amount;

    if p_coupon_ids is not null and array_length(p_coupon_ids, 1) > 0 then
      -- 1) 쿠폰 판정 (DB 쓰기는 아직 없음). 판정 축은 "쌍 OR"다(sql/68
      --    5-d절 재정정 근거 그대로) — granted 는 학생 소유·미소진 우선,
      --    아니면 학부모, 둘 다 아니면 제외. auto 는 소유 판정 없음.
      for v_coupon in
        select c.id, c.slug, c.discount_amount, c.min_amount, c.valid_until, c.is_active,
               c.max_uses_per_user, c.max_redemptions, c.stackable, c.grant_type
        from public.coupons c
        where c.id = any (p_coupon_ids)
        order by c.slug
      loop
        if v_coupon.max_redemptions is not null then
          perform pg_advisory_xact_lock(hashtextextended(v_coupon.id::text, 1));
        end if;

        -- (coupon_id, 프로필) 쌍 락 — 학생·학부모 양쪽을 잠근다(sql/68
        -- 5-d절 근거 그대로). 순서는 역할이 아니라 프로필 id 문자열
        -- 비교로 고정한다(member_type 이 역할 배타성을 DB 로 강제하지
        -- 않는다는 sql/68 실측 근거 그대로 유지).
        if v_coupon.grant_type = 'granted' then
          if v_order.student_profile_id::text < v_order.parent_profile_id::text then
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.student_profile_id::text, 2)));
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.parent_profile_id::text, 2)));
          else
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.parent_profile_id::text, 2)));
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.student_profile_id::text, 2)));
          end if;
        end if;

        -- ② 30분 소프트 홀드 lazy 정리(1-d/1-e절과 짝, 2026-08-12c 팀 리드
        -- 재지시 — 스코프를 쌍에서 전역으로 정정) — 시간 기반이라 트리거로
        -- 못 한다.
        --
        -- 처음엔 "그 주문의 쌍(학생·학부모)"으로 스코프를 좁혔었다.
        -- 회귀였다 — auto(grant_type<>'granted') 쿠폰은 redemption.user_id
        -- 가 항상 NULL(6-b절 귀속 규칙, 소유자 개념 자체가 없음)이라
        -- `user_id in (student, parent)` 조건에 어떤 pending 행도 걸리지
        -- 않는다. ③에서 판정 함수(fn_coupon_global_redeemed)의 상태 기반
        -- 시간창을 완전히 걷어내고 voided_at 단일 축으로 바꿨으므로, auto
        -- 쿠폰의 방치된 pending redemption 을 걷어낼 경로가 쌍-스코프
        -- 정리 하나뿐이면 그 경로가 auto 를 아예 못 건드려 "정리하는 곳이
        -- 아무 데도 없음"이 된다 — sql/55 원본은 이 정리를 소유자와 무관한
        -- 전역으로 했었다(1-c절 상단 주석 근거). 30분 홀드는 애초에
        -- redemption(결제창 이탈) 단위 개념이지 소유자 축 개념이 아니다.
        -- fn_coupon_global_redeemed 의 전역 카운트도 소유자와 무관하게
        -- 세므로, 그 카운트를 회복시키는 정리도 대칭으로 전역이어야 한다.
        -- 그래서 소유자 조건을 없애고 그 쿠폰의 pending 초과 redemption
        -- 전부(소유자 무관, NULL 포함)를 대상으로 한다. 자기 자신
        -- (p_order_id, 방금 fn_request_enrollment 로 막 만든 행)은 여전히
        -- 제외한다 — 스스로 만든 행을 스스로 void 하면 안 된다.
        --
        -- 락 범위 — 전역 정리로 바뀌면서 다른 주문(다른 쌍)의 redemption
        -- 을 건드리는데, 이 UPDATE 자체가 대상 행에 대한 락 없이도
        -- 안전하다: Postgres 는 UPDATE 문이 매칭한 행에 자동으로 행 잠금을
        -- 걸고, 동시에 같은 행을 노리는 두 번째 UPDATE 는 첫 번째가
        -- 커밋할 때까지 블록됐다가 WHERE 절을 최신 버전으로 재평가한다
        -- (EvalPlanQual, READ COMMITTED 표준 동작) — 첫 번째가 이미
        -- voided_at 을 채웠다면 두 번째의 WHERE(voided_at is null)가 더
        -- 이상 맞지 않아 0행으로 조용히 건너뛴다. 그래서 이 UPDATE 는
        -- advisory lock 없이도 그 자체로 멱등·직렬화된다(sql/55 상단
        -- "SERIALIZABLE 대신 advisory lock" 절과 다른 이유로, 여기서는
        -- MVCC 행 잠금만으로 충분하다). advisory lock(salt=1/salt=2)이
        -- 지키는 건 이 정리가 아니라 그 뒤에 이어지는 "판정 → 귀속 insert"
        -- 구간의 전역/쌍 카운트 정합성이다 — salt=1(max_redemptions 가
        -- NOT NULL 일 때만)이 지키는 전역 카운트 상한은 max_redemptions 가
        -- NULL 인 쿠폰엔 애초에 존재하지 않는 불변식이라(fn_coupon_global_
        -- redeemed 가 max_redemptions is null 이면 항상 false) 그 경우
        -- salt=1 없이 전역 정리가 실행돼도 지켜야 할 카운트 상한 자체가
        -- 없어 문제되지 않는다. 정리한 뒤 30분(fn_coupon_pending_hold_
        -- minutes, 1-d절 정본)을 넘긴 pending redemption 을 void 한다 —
        -- 그래야 1-c절 voided_at 단일 축 판정이 "결제창 이탈"을 여전히
        -- 미소진으로 본다.
        update public.coupon_redemptions cr
           set voided_at   = v_now,
               void_reason = 'pending_hold_expired'
          from public.orders o
         where cr.order_id = o.id
           and cr.coupon_id = v_coupon.id
           and cr.order_id <> p_order_id
           and cr.voided_at is null
           and o.status = 'pending'
           and cr.created_at < v_now - (public.fn_coupon_pending_hold_minutes() || ' minutes')::interval;

        if not v_coupon.is_active then
          continue;
        end if;
        if v_coupon.valid_until is not null
           and v_coupon.valid_until < (v_now at time zone 'Asia/Seoul')::date then
          continue;
        end if;
        if v_subtotal < v_coupon.min_amount then
          continue;
        end if;

        if v_coupon.grant_type = 'granted' then
          if public.fn_coupon_is_granted(v_coupon.id, v_order.student_profile_id)
             and not public.fn_coupon_is_redeemed(v_coupon.id, v_order.student_profile_id, v_now) then
            v_owner := v_order.student_profile_id;
          elsif public.fn_coupon_is_granted(v_coupon.id, v_order.parent_profile_id)
                and not public.fn_coupon_is_redeemed(v_coupon.id, v_order.parent_profile_id, v_now) then
            v_owner := v_order.parent_profile_id;
          else
            continue;
          end if;
        else
          v_owner := null;
        end if;

        if public.fn_coupon_global_redeemed(v_coupon.id, v_now) then
          continue;
        end if;

        v_cand_ids       := array_append(v_cand_ids, v_coupon.id);
        v_cand_discounts := array_append(v_cand_discounts, v_coupon.discount_amount);
        v_cand_stackable := array_append(v_cand_stackable, v_coupon.stackable);
        v_cand_owners    := array_append(v_cand_owners, v_owner);
      end loop;

      -- 2) stacking 정산 — sql/68 원문과 동일.
      v_best_nonstack_idx := null;
      for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
        if not v_cand_stackable[v_i] then
          if v_best_nonstack_idx is null
             or v_cand_discounts[v_i] > v_cand_discounts[v_best_nonstack_idx] then
            v_best_nonstack_idx := v_i;
          end if;
        end if;
      end loop;

      -- 3) 최종 적용 목록 조립 — sql/68 원문과 동일.
      for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
        if v_cand_stackable[v_i] or v_i = v_best_nonstack_idx then
          if v_coupon_discount + v_cand_discounts[v_i] >= v_subtotal then
            continue;
          end if;
          v_applied_ids       := array_append(v_applied_ids, v_cand_ids[v_i]);
          v_applied_discounts := array_append(v_applied_discounts, v_cand_discounts[v_i]);
          v_applied_owners     := array_append(v_applied_owners, v_cand_owners[v_i]);
          v_coupon_discount    := v_coupon_discount + v_cand_discounts[v_i];
        end if;
      end loop;

      v_coupon_discount := least(v_coupon_discount, v_subtotal);
    end if;

    -- 4) 확정 금액 — 요청 시점 discount_amount(상품 단위 할인, 1-a절
    --    근거)에 쿠폰 할인을 "더한다"(교체 아님) — orders.discount_amount
    --    = 상품 할인 + 쿠폰 할인의 합이라는 불변식(sql/55_coupon_policy.
    --    sql:182-193)을 유지해야 orders_amount_balance_check 와 감사용
    --    분해 쿼리가 계속 맞는다. p_coupon_ids 가 NULL/빈 배열이면
    --    v_coupon_discount=0 이라 그냥 승인(쿠폰 없이)과 같다.
    v_new_discount_total := v_order.discount_amount + v_coupon_discount;
    v_new_amount          := v_order.list_amount - v_new_discount_total;

    if v_new_amount <= 0 then
      raise exception 'invalid_amount' using errcode = 'WC001';
    end if;

    update public.orders
       set approval_status  = 'approved',
           responded_at     = now(),
           discount_amount  = v_new_discount_total,
           amount           = v_new_amount,
           coupon_id        = case when array_length(v_applied_ids, 1) > 0
                                then v_applied_ids[1] else null end
     where id = p_order_id
    returning * into v_order;

    -- 6-a) 소진 직전 재검증(WC031) — sql/68 5-d절과 동일 원칙. advisory
    --    lock 을 우회한 경로가 이 트랜잭션과 동시에 같은 (coupon, owner)
    --    를 소진했다는 뜻이다 — 정상 흐름에서는 도달 불가에 가깝다.
    if array_length(v_applied_ids, 1) > 0 then
      for v_i in 1 .. array_length(v_applied_ids, 1) loop
        if v_applied_owners[v_i] is not null
           and public.fn_coupon_is_redeemed(v_applied_ids[v_i], v_applied_owners[v_i], v_now) then
          raise exception 'coupon_per_user_cap_exceeded'
            using errcode = 'WC031',
                  detail  = format('coupon_id=%s owner_profile_id=%s — advisory lock 우회 의심(귀속 직전 재검증 실패)',
                                    v_applied_ids[v_i], v_applied_owners[v_i]);
        end if;
      end loop;

      -- 6-b) 쿠폰 귀속(사용 이력) — sql/68 원문과 동일.
      insert into public.coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
      select v_applied_ids[gs.i], v_applied_owners[gs.i], p_order_id, v_applied_discounts[gs.i]
      from generate_subscripts(v_applied_ids, 1) as gs(i);
    end if;
  else
    if coalesce(btrim(p_reject_reason), '') = '' then
      raise exception 'reject_reason_required' using errcode = 'WC025';
    end if;

    update public.orders
       set approval_status = 'rejected',
           responded_at    = now(),
           reject_reason   = p_reject_reason,
           -- 승인 전 주문은 orders_approval_before_payment_check 상 항상
           -- pending/canceled 였다 — 반려는 그 주문을 종결시킨다.
           status          = 'canceled'
     where id = p_order_id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

comment on function public.fn_respond_enrollment(text, boolean, text, uuid[]) is
  '학부모가 학생의 수강신청(주문)을 수락/반려한다(sql/69 재작성 — signature 에 p_coupon_ids 추가, R4 해소). 호출자는 반드시 그 주문의 parent_profile_id(WC022) 여야 하고 approval_status 가 requested 여야 한다(WC023). 승인 시 쿠폰을 여기서 직접 확정한다(sql/68 fn_redeem_coupons 쿠폰 판정 블록 이관 — 쌍 OR 자격·advisory lock·stacking·재검증 WC031 전부 동일). p_coupon_ids 가 NULL/빈 배열이면 쿠폰 없이 승인. discount_amount 는 요청 시점 값(상품 할인)에 쿠폰 할인을 더한다(교체 아님). fn_revalidate_order_coupons 호출은 제거했다(방금 확정했으므로 재검증 무의미, WC024 폐기). 반려 시 사유 필수(WC025)이며 orders.status 를 canceled 로 내린다.';

revoke all on function public.fn_respond_enrollment(text, boolean, text, uuid[]) from public, anon;
grant execute on function public.fn_respond_enrollment(text, boolean, text, uuid[]) to authenticated;


-- =====================================================================
-- 2) fn_grant_program_access_for_order 재작성
--    R2c(부여 함수 상태 가드) + R7(원장 기반 restore_revoked 가드) 를
--    한 함수 안에서 함께 처리한다(같은 함수를 두 번 재작성할 수 없다 —
--    팀 리드가 지시한 "할 일" 2)/6) 번이 여기 하나로 합쳐진다).
--    시그니처는 그대로다(text, uuid, timestamptz, boolean) — 호출부
--    (api/_lib/programAccess.js:145-150)는 변경 없이 그대로 호출된다.
-- ---------------------------------------------------------------------
-- 2-a) R2c — 상태 가드. orders.status<>'paid' 또는 approval_status<>
--    'approved' 면 예외를 던진다. 가상계좌(waiting_deposit)는 이 가드로
--    자동으로 막힌다(paid 만 허용하는 기존 정책과 일치). 이 가드가
--    R2b(api/confirm-payment.js 의 부분 커밋 — orders UPDATE 실패를
--    로그만 하고 부여를 계속 실행하는 문제)의 **백스톱**이다 — api 를
--    고치는 다음 단계 이전에도 이 구멍이 DB 층에서 닫혀 있어야 한다는
--    것이 이 항목의 목적이다. api/_lib/programAccess.js:167 는 이 예외를
--    catch 해서 result.error 로만 반환하므로(throw 하지 않음) 여기서
--    막혀도 confirm-payment.js 자체는 죽지 않는다 — access.ok=false 로
--    응답한다(실측 확인).
--
-- 2-b) R7 — restore_revoked 판정을 캐시(program_access) 대신 원장
--    (program_access_grants)으로 바꾼다. 그 order_item_id 에 대해
--    revoked_at is not null 인 부여가 이미 있으면, p_restore_revoked=
--    false 일 때 재삽입하지 않고 skip 한다(reason='revoked_not_restored'
--    유지). 지금은 program_access_grants_live_item_uniq 가 revoked_at
--    is null 조건부 부분 유니크라 회수된 행이 있어도 새 행이 그냥
--    들어간다 — 그게 재삽입의 직접 원인이다(sql/64:419-421 실측).
--    캐시(program_access)는 계속 sync 대상이다(마지막 foreach 블록,
--    변경 없음) — 판정 근거에서만 뺀다. suspended 판정(admin 제재)은
--    원장에 대응 개념이 없으므로 그대로 캐시를 본다.
-- ---------------------------------------------------------------------
create or replace function public.fn_grant_program_access_for_order(
  p_order_id        text,
  p_user_id         uuid,
  p_paid_at         timestamptz default null,
  p_restore_revoked boolean     default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order        public.orders;
  v_existing     public.program_access;
  v_item         record;
  v_paid_at      timestamptz;
  v_anchor       timestamptz;
  v_start        timestamptz;
  v_expires      timestamptz;
  v_key          text;
  v_item_count   int    := 0;
  v_inserted     int    := 0;
  v_skipped      jsonb  := '[]'::jsonb;
  v_service_keys text[] := '{}';
  v_blocked      text[] := '{}';
  v_keys         text[] := '{}';
  v_sync         jsonb  := '[]'::jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 결제자(학부모) 확인. p_user_id 는 호출부가 orders.user_id(=parent_
  -- profile_id, orders_user_id_is_parent_check)를 그대로 넘긴다.
  if v_order.parent_profile_id is distinct from p_user_id then
    raise exception 'order_user_mismatch' using errcode = 'WC011';
  end if;

  -- 2-a) R2c 상태 가드(신규). 미승인·미결제 주문에는 권한을 줄 수 없다 —
  -- 위 함수 코멘트 참고. detail 에 실제 값을 담아 운영 진단에 쓴다.
  if v_order.status <> 'paid' then
    raise exception 'order_not_paid'
      using errcode = 'WC033',
            detail  = format('order_id=%s status=%s', p_order_id, v_order.status);
  end if;

  -- 도달 불가에 가까운 방어적 가드(팀 리드 실측, 2026-08-12b E2E) —
  -- orders_approval_before_payment_check(3절)가 approval_status<>'approved'
  -- 인 주문은 항상 status<>'paid' 로 묶어 두므로, 위 WC033 가드를 이미
  -- 통과했다면 이 분기는 정상 경로로는 도달할 수 없다. 그래도 이 함수
  -- 하나만 보고도 두 축을 모두 강제한다는 게 드러나야 하고, 위 CHECK 가
  -- 나중에 느슨해지는 사고에 대한 방어선으로 남긴다(sql/64/68 의 "student_
  -- profile_id is null" 도달 불가 분기와 같은 관례).
  if v_order.approval_status <> 'approved' then
    raise exception 'order_not_approved'
      using errcode = 'WC034',
            detail  = format('order_id=%s approval_status=%s', p_order_id, v_order.approval_status);
  end if;

  -- student_profile_id 는 orders_student_profile_id_fkey 로 NOT NULL 이
  -- 보장돼 이 분기는 도달 불가에 가깝다(sql/64 원문의 "비회원 결제" 방어를
  -- 대상만 바꿔 그대로 남긴다, sql/68).
  if v_order.student_profile_id is null then
    return jsonb_build_object(
      'ok', true, 'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  -- 부여 대상(학생) 단위로 부여·회수를 직렬화한다(sql/64 salt=101, 대상만
  -- student_profile_id — consume_performance_credit·회수 함수와 같은 축).
  perform pg_advisory_xact_lock(hashtextextended(v_order.student_profile_id::text, 101));

  v_paid_at := coalesce(p_paid_at, v_order.paid_at, now());
  v_anchor  := public.fn_kst_day_start(v_paid_at);

  select count(*) into v_item_count from public.order_items where order_id = p_order_id;
  if v_item_count = 0 then
    return jsonb_build_object(
      'ok', false, 'error', 'no_order_items', 'granted', '[]'::jsonb,
      'service_keys', '[]'::jsonb, 'skipped', '[]'::jsonb,
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  for v_item in
    select oi.id as order_item_id, oi.quantity, oi.price,
           oi.product_slug, oi.service_key,
           p.id as product_id, p.program_key, p.duration_months, p.session_quota
      from public.order_items oi
      left join public.products p
             on p.id = oi.product_id
             or (oi.product_id is null and p.slug = oi.product_slug)
     where oi.order_id = p_order_id
     order by oi.id asc
  loop
    if v_item.service_key is not null
       and not (v_item.service_key = any(v_service_keys)) then
      v_service_keys := v_service_keys || v_item.service_key;
    end if;

    if v_item.program_key is null then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', null,
        'reason', 'no_program_key_mapping');
      continue;
    end if;

    if v_item.quantity <> 1 then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'unsupported_quantity');
      continue;
    end if;

    if v_item.duration_months is null and v_item.session_quota is null then
      raise exception 'product_entitlement_spec_missing'
        using errcode = 'WC012',
              detail  = format('order_item_id=%s product_slug=%s program_key=%s',
                               v_item.order_item_id, v_item.product_slug, v_item.program_key);
    end if;

    -- 부여 대상은 학생이다(사용자 확정 5번) — v_order.student_profile_id.
    select * into v_existing
      from public.program_access
     where id = v_order.student_profile_id and program_key = v_item.program_key
       for update;

    if found and v_existing.access_status = 'suspended' then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'suspended_by_admin');
      if not (v_item.program_key = any(v_blocked)) then
        v_blocked := v_blocked || v_item.program_key;
      end if;
      continue;
    end if;

    -- 2-b) R7 — restore_revoked 판정을 원장(program_access_grants)으로.
    -- 캐시(program_access) 대신 이 order_item_id 자체의 회수 이력을 본다
    -- (위 함수 코멘트 2-b절 근거).
    if not p_restore_revoked
       and exists (
         select 1 from public.program_access_grants g
          where g.order_item_id = v_item.order_item_id and g.revoked_at is not null
       ) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'revoked_not_restored');
      if not (v_item.program_key = any(v_blocked)) then
        v_blocked := v_blocked || v_item.program_key;
      end if;
      continue;
    end if;

    if exists (
      select 1 from public.program_access_grants g
       where g.order_item_id = v_item.order_item_id and g.revoked_at is null
    ) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'already_granted');
      continue;
    end if;

    select greatest(v_anchor, max(g.expires_at)) into v_start
      from public.program_access_grants g
     where g.profile_id  = v_order.student_profile_id
       and g.program_key = v_item.program_key
       and g.revoked_at is null;
    v_start   := coalesce(v_start, v_anchor);
    v_expires := public.fn_add_months_kst(v_start, v_item.duration_months);

    insert into public.program_access_grants (
      profile_id, program_key, order_id, order_item_id,
      product_id, product_slug, granted_by,
      granted_months, granted_sessions, paid_amount, starts_at, expires_at
    ) values (
      v_order.student_profile_id, v_item.program_key, p_order_id, v_item.order_item_id,
      v_item.product_id, v_item.product_slug, 'payment',
      v_item.duration_months, v_item.session_quota,
      coalesce(v_item.price, 0) * coalesce(v_item.quantity, 1),
      v_start, v_expires
    );
    v_inserted := v_inserted + 1;
  end loop;

  select coalesce(array_agg(distinct g.program_key), '{}')
    into v_keys
    from public.program_access_grants g
   where g.order_id = p_order_id
     and g.revoked_at is null
     and not (g.program_key = any(v_blocked));

  foreach v_key in array v_keys loop
    v_sync := v_sync || public.fn_sync_program_access_cache(v_order.student_profile_id, v_key, null);
  end loop;

  return jsonb_build_object(
    'ok',              true,
    'granted',         to_jsonb(v_keys),
    'service_keys',    to_jsonb(v_service_keys),
    'skipped',         v_skipped,
    'ledger_inserted', v_inserted,
    'synced',          v_sync
  );
end;
$$;

comment on function public.fn_grant_program_access_for_order(text, uuid, timestamptz, boolean) is
  '주문 하나에 대해 이용 권한을 부여한다(sql/69 재작성 — R2c 상태 가드 + R7 원장 기반 restore_revoked). orders.status<>paid(WC033)/approval_status<>approved(WC034) 면 예외 — api/confirm-payment.js 의 부분 커밋에 대한 DB 층 백스톱이다. restore_revoked 판정은 캐시(program_access) 대신 그 order_item_id 자체의 program_access_grants 회수 이력을 본다(R7 해소 — 캐시 축 뚫림/과차단 둘 다 사라진다). 그 외(라인별 skipped·WC010~012·체이닝·suspended 판정)는 sql/64/68 원문과 동일.';

revoke all on function public.fn_grant_program_access_for_order(text, uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_grant_program_access_for_order(text, uuid, timestamptz, boolean)
  to service_role;


-- =====================================================================
-- 3) orders_approval_before_payment_check 수정 (내 설계 오류)
--    기존: approval_status='approved' or status in ('pending','canceled')
--    문제: 미승인 주문의 결제 실패를 status='failed' 로 기록할 수 없다
--      (23514) → api/confirm-payment.js:284 의 실패 기록 UPDATE 가 죽고
--      주문이 영구 pending 으로 남는다.
--    수정: 실패 기록은 승인 여부와 무관하게 항상 가능해야 한다 — status
--      허용 목록에 'failed' 를 추가한다. 승인축 자체(approval_status)는
--      건드리지 않는다 — 여전히 학부모 수락 전에는 paid/waiting_deposit
--      로 못 나간다.
-- =====================================================================
alter table public.orders drop constraint if exists orders_approval_before_payment_check;
alter table public.orders add constraint orders_approval_before_payment_check
  check (approval_status = 'approved' or status in ('pending', 'canceled', 'failed'));

comment on constraint orders_approval_before_payment_check on public.orders is
  '학부모 수락 전에는 결제가 진행될 수 없다 — approval_status 가 requested/rejected 인 동안 orders.status 는 pending/canceled/failed 만 허용된다(사용자 확정 흐름: 학생 신청 → 학부모 수락 → 결제, sql/68). failed 추가(sql/69, 내 설계 오류 수정) — 결제 실패 기록은 승인 여부와 무관하게 항상 가능해야 한다. 이게 없으면 미승인 주문의 토스 승인 실패가 23514 로 막혀 영구 pending 으로 남는다(R2 재현).';


-- =====================================================================
-- 4) refund_requests_approval_before_processing_check 수정 (R5, 내 설계 오류)
--    기존: approval_status='approved' or status='requested'
--    문제: 학부모가 반려한 건(approval_status='rejected')을 어드민이
--      어떤 상태로도 종결할 수 없다 — status 가 'requested' 에 못박힌다.
--    수정: 미승인 건은 requested(대기) 또는 rejected(종결)만 가능하고,
--      processing/completed 는 승인된 건만 갈 수 있다.
-- =====================================================================
alter table public.refund_requests drop constraint if exists refund_requests_approval_before_processing_check;
alter table public.refund_requests add constraint refund_requests_approval_before_processing_check
  check (approval_status = 'approved' or status in ('requested', 'rejected'));

comment on constraint refund_requests_approval_before_processing_check on public.refund_requests is
  '미승인 환불 신청(approval_status in requested/rejected)은 어드민 처리축(status)이 requested 또는 rejected 만 될 수 있다 — processing/completed 는 approval_status=approved 가 되어야만 갈 수 있다(sql/68 원문 의도 유지). rejected 추가(sql/69, 내 설계 오류 수정) — 학부모가 반려한 건을 어드민이 종결(rejected)할 수 있어야 한다. 기존 CHECK(status=requested 고정)는 반려 환불이 어드민 큐를 영구 오염시켰다(R5 재현).';


-- =====================================================================
-- 5) R3 — 환불 완료를 단일 RPC 로
-- =====================================================================

-- ---------------------------------------------------------------------
-- 5-a) orders_status_check 에 'refunded' 추가 — 환불 종결을 orders 에
--    표현할 수단이 지금까지 없었다(sql/55 0-d절 원문은 5개 값만 허용).
-- ---------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'paid', 'waiting_deposit', 'failed', 'canceled', 'refunded'));

comment on constraint orders_status_check on public.orders is
  '허용값 6개(sql/55 0-d절 5개 + refunded, sql/69). refunded = fn_complete_refund 가 환불을 완결하며 세팅하는 최종 상태. fn_coupon_is_redeemed/fn_coupon_global_redeemed(sql/69 1-c절)는 더 이상 이 컬럼을 보지 않는다(voided_at 단일 축) — refunded 로 전이돼도 1-e절 트리거가 쿠폰을 자동 void 하지 않는다(환불 쿠폰 복원은 운영자가 수기로 한다, sql/55_coupon_policy.sql:104-112 확정 정책). 새 status 값을 추가할 때는 1-e절 트리거의 대상 목록(canceled/failed)을 재검토할 것.';


-- ---------------------------------------------------------------------
-- 5-b) fn_order_consumption_state — 소비 판정 공통 함수(판정 로직 복제
--    금지 원칙). sql/68 fn_request_refund(5-b절)에 있던 소비 게이트
--    본문(회차 순소비 + 기간권 최초 진입)을 그대로 옮긴다. fn_request_
--    refund 와 아래 5-e) fn_complete_refund 양쪽이 이 함수를 쓴다.
-- ---------------------------------------------------------------------
create or replace function public.fn_order_consumption_state(p_order_id text)
returns table (
  consumed          boolean,
  consumed_sessions text,
  consumed_period   text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sessions as (
    select string_agg(format('%s:%s회', t.program_key, t.used), ', ') as v
      from (
        select g.program_key, sum(-l.delta) as used
          from public.performance_credit_ledger l
          join public.program_access_grants g on g.id = l.grant_id
         where g.order_id = p_order_id
         group by g.program_key
        having sum(-l.delta) > 0
      ) t
  ),
  period as (
    select string_agg(
             format('%s:%s', g.program_key, to_char(g.first_accessed_at, 'YYYY-MM-DD HH24:MI')),
             ', '
           ) as v
      from public.program_access_grants g
     where g.order_id = p_order_id and g.first_accessed_at is not null
  )
  select
    (sessions.v is not null or period.v is not null) as consumed,
    sessions.v as consumed_sessions,
    period.v   as consumed_period
  from sessions, period;
$$;

comment on function public.fn_order_consumption_state(text) is
  '주문 하나의 소비 여부 판정 정본(sql/69, sql/68 fn_request_refund 5-b절에서 이관 — 판정 로직 복제 금지 원칙). 회차권은 performance_credit_ledger 순소비(sum(-delta))>0, 기간권은 program_access_grants.first_accessed_at is not null. fn_request_refund(신청 게이트, WC032)와 fn_complete_refund(완료 직전 재판정, WC032 재사용) 둘 다 이 함수를 쓴다.';

revoke all on function public.fn_order_consumption_state(text)
  from public, anon, authenticated;
grant execute on function public.fn_order_consumption_state(text) to service_role;


-- ---------------------------------------------------------------------
-- 5-c) fn_refund_completed_amount — 누적 완료 환불액 공통 함수. 그 주문의
--    refund_requests 중 status='completed' 인 금액 합. fn_complete_refund
--    (완료 직전 상한 가드)와 fn_request_refund(신규 신청 차단 가드) 둘
--    다 이 값을 쓴다 — 계산을 두 번 짜지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.fn_refund_completed_amount(p_order_id text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(amount), 0)::integer
    from public.refund_requests
   where order_id = p_order_id
     and status = 'completed';
$$;

comment on function public.fn_refund_completed_amount(text) is
  '그 주문의 완료(status=completed) 환불 누적액. fn_complete_refund 5)단계와 fn_request_refund 신규 누적액 가드가 공유한다(sql/69, R3 이중 환불 무제한 해소).';

revoke all on function public.fn_refund_completed_amount(text)
  from public, anon, authenticated;
grant execute on function public.fn_refund_completed_amount(text) to service_role;


-- ---------------------------------------------------------------------
-- 5-d) fn_request_refund 재작성 : 시그니처 그대로. 소비 게이트를 5-b)
--    공통 함수로 교체하고, 누적 환불액 가드를 추가한다.
--
--    누적 가드 위치 — 미종결 판정(기존 EXISTS, status in requested/
--    processing and approval_status<>rejected)에 completed 를 넣지
--    않는다. 넣으면 "반려 후 재신청 허용"(사용자 확정 4번)이 깨진다
--    (반려는 이 EXISTS 축이 아니라 approval_status 축으로 이미 빠진다).
--    completed 는 별도로 "누적액이 orders.amount 를 채웠는가"만으로
--    판정한다 — 그래서 두 판정을 하나로 합치지 않았다.
-- ---------------------------------------------------------------------
create or replace function public.fn_request_refund(
  p_order_id       text,
  p_reason         text,
  p_refund_bank    text default null,
  p_refund_account text default null,
  p_refund_holder  text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order             public.orders;
  v_row               public.refund_requests;
  v_caller            uuid := auth.uid();
  v_status            text;
  v_resp_at           timestamptz;
  v_consumption       record;
  v_completed_amount  integer;
begin
  -- sql/68/59 와 동일 원칙 — 같은 주문에 대한 동시 이중 클릭/중복 호출을 직렬화.
  perform pg_advisory_xact_lock(hashtextextended(p_order_id, 100));

  select * into v_order from public.orders where id = p_order_id;

  -- 존재하지 않음과 쌍 소속 아님을 같은 코드로 묶는다(존재 여부 스캐닝 방지).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- 소비 시 환불 불가 게이트(WC032) — 판정은 5-b) 공통 함수로 이관했다
  -- (sql/69, 판정 로직 복제 금지 원칙). detail 어휘는 sql/68 원문과 동일.
  select * into v_consumption from public.fn_order_consumption_state(p_order_id);
  if v_consumption.consumed then
    raise exception 'order_already_consumed'
      using errcode = 'WC032',
            detail  = format('order_id=%s 회차소비=[%s] 기간권진입=[%s]',
                              p_order_id, coalesce(v_consumption.consumed_sessions, '-'), coalesce(v_consumption.consumed_period, '-'));
  end if;

  -- 미종결 신청이 이미 있으면 거부 — sql/68 3)절 부분 유니크 인덱스와
  -- 정확히 같은 조건식이다(그 인덱스는 이 판정이 틀렸을 때의 DB 백스톱).
  if exists (
    select 1 from public.refund_requests
     where order_id = p_order_id
       and order_item_id is null
       and status in ('requested', 'processing')
       and approval_status <> 'rejected'
  ) then
    raise exception 'duplicate_refund_request' using errcode = 'WC007';
  end if;

  -- 누적 환불액 가드(신규, R3) — 이미 완료된 환불액이 orders.amount 를
  -- 채웠으면 신규 신청 자체를 거부한다. 위 미종결 판정에 completed 를
  -- 넣지 않은 이유는 이 함수 코멘트 참고 — 반려 후 재신청은 계속 허용해야
  -- 하고, 완료 건은 "미종결"이 아니라 "누적액"으로만 막는다.
  v_completed_amount := public.fn_refund_completed_amount(p_order_id);
  if v_completed_amount >= v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s orders.amount=%s',
                              p_order_id, v_completed_amount, v_order.amount);
  end if;

  -- 학생 신청 → 학부모 응답 대기. 학부모 신청 → 즉시 승인(사용자 확정 3번).
  if v_caller = v_order.parent_profile_id then
    v_status  := 'approved';
    v_resp_at := now();
  else
    v_status  := 'requested';
    v_resp_at := null;
  end if;

  insert into public.refund_requests (
    user_id, order_id, order_item_id, order_name, amount, reason,
    refund_bank, refund_account, refund_holder, status,
    student_profile_id, parent_profile_id, requested_by,
    approval_status, approval_responded_at
  ) values (
    v_caller, v_order.id, null, v_order.order_name, v_order.amount, p_reason,
    p_refund_bank, p_refund_account, p_refund_holder, 'requested',
    v_order.student_profile_id, v_order.parent_profile_id, v_caller,
    v_status, v_resp_at
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_request_refund(text, text, text, text, text) is
  '환불 신청 생성(sql/69 재작성). 소비 게이트(WC032)는 fn_order_consumption_state 공통 함수를 쓴다(5-b절). 누적 환불액 가드(WC037, 신규) — 이미 완료된 환불액이 orders.amount 를 채웠으면 신규 신청 자체를 거부(반려 후 재신청은 계속 허용, 5-d절 코멘트 참고). 그 외(주문 소유권 WC005·결제 상태 WC006·중복 WC007·쌍 판정)는 sql/68 원문과 동일.';

revoke all on function public.fn_request_refund(text, text, text, text, text) from public, anon;
grant execute on function public.fn_request_refund(text, text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5-e) fn_complete_refund 신설 — 환불 완료를 단일 RPC 로. is_admin() 만
--    실행 가능. 한 트랜잭션에서: advisory lock → 승인 확인 → 처리 가능
--    상태 확인 → 소비 재판정 → 누적액 가드 → status=completed → 권한
--    회수 → orders.status=refunded.
-- ---------------------------------------------------------------------
create or replace function public.fn_complete_refund(
  p_refund_request_id bigint,
  p_admin_memo         text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id        text;
  v_row             public.refund_requests;
  v_order           public.orders;
  v_consumption     record;
  v_completed_amount integer;
  v_revoke_result   jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select r.order_id into v_order_id
    from public.refund_requests r
   where r.id = p_refund_request_id;

  if v_order_id is null then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  -- 1) advisory lock — fn_request_refund 와 같은 축(salt 100, 주문 단위
  -- 직렬화). 신청/완료가 같은 주문에 동시에 들어와도 줄을 세운다.
  perform pg_advisory_xact_lock(hashtextextended(v_order_id, 100));

  select * into v_row from public.refund_requests where id = p_refund_request_id for update;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  select * into v_order from public.orders where id = v_row.order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 2) 승인축 확인 — 학부모(또는 학부모 본인 신청의 자동 승인)가 승인한
  -- 건만 완료할 수 있다.
  if v_row.approval_status <> 'approved' then
    raise exception 'refund_not_approved_for_completion' using errcode = 'WC035';
  end if;

  -- 3) 처리 가능 상태 확인 — 이미 completed 면 멱등 처리하지 않고
  -- 명시적으로 거부한다(팀 리드 지시 — 재실행이 권한 재회수·중복 세팅을
  -- 조용히 반복하면 안 된다). rejected 도 재완료 대상이 아니다.
  if v_row.status not in ('requested', 'processing') then
    raise exception 'refund_completion_not_processable'
      using errcode = 'WC036',
            detail  = format('refund_request_id=%s status=%s', p_refund_request_id, v_row.status);
  end if;

  -- 4) 소비 재판정 — fn_request_refund 신청 시점 이후 소비가 발생했을 수
  -- 있다(요청 → 소비 → 완료 순서 방지). 공통 함수 재사용(5-b절).
  select * into v_consumption from public.fn_order_consumption_state(v_row.order_id);
  if v_consumption.consumed then
    raise exception 'order_already_consumed'
      using errcode = 'WC032',
            detail  = format('order_id=%s 회차소비=[%s] 기간권진입=[%s]',
                              v_row.order_id, coalesce(v_consumption.consumed_sessions, '-'), coalesce(v_consumption.consumed_period, '-'));
  end if;

  -- 5) 누적 환불액 가드 — 이 완료로 orders.amount 를 넘기면 거부(이중
  -- 환불 방지, 공통 함수 재사용 5-c절).
  v_completed_amount := public.fn_refund_completed_amount(v_row.order_id);
  if v_completed_amount + v_row.amount > v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s this_amount=%s orders.amount=%s',
                              v_row.order_id, v_completed_amount, v_row.amount, v_order.amount);
  end if;

  -- 6) 완료 처리 — 아래 5-f) 트리거가 이 UPDATE 만 허용하도록 세션
  -- 변수를 먼저 세운다(트랜잭션 로컬, is_local=true).
  perform set_config('winning.refund_completing', p_refund_request_id::text, true);

  update public.refund_requests
     set status     = 'completed',
         admin_memo = coalesce(p_admin_memo, admin_memo)
   where id = p_refund_request_id
  returning * into v_row;

  -- 7) 권한 회수.
  v_revoke_result := public.fn_revoke_program_access_for_order(
    v_row.order_id, v_order.user_id, 'refunded', 'refund_completed');

  -- 8) 주문 종결.
  update public.orders
     set status = 'refunded'
   where id = v_row.order_id;

  return v_row;
end;
$$;

comment on function public.fn_complete_refund(bigint, text) is
  '환불 완료를 한 트랜잭션에서 처리하는 단일 정본 RPC(sql/69, R3 해소). is_admin() 만 실행 가능(42501). 승인축 확인(WC035)·처리 가능 상태 확인(WC036, 이미 completed 면 멱등 아닌 명시적 거부)·소비 재판정(WC032, fn_order_consumption_state 재사용)·누적 환불액 가드(WC037, fn_refund_completed_amount 재사용)를 통과해야 status=completed 로 바뀌고, 그 즉시 fn_revoke_program_access_for_order 로 권한을 회수하고 orders.status=refunded 로 종결한다. 5-f) 트리거가 이 함수 밖에서의 status=completed 직접 UPDATE(어드민 화면 제네릭 PATCH)를 차단한다 — (i)이중 환불 (ii)권한 미회수 (iii)소비 재판정 없음 세 갈래를 한 번에 막는다.';

revoke all on function public.fn_complete_refund(bigint, text) from public, anon;
grant execute on function public.fn_complete_refund(bigint, text) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5-f) refund_requests 직접 PATCH 차단 트리거. status 가 'completed' 로
--    바뀌는 UPDATE 는 fn_complete_refund 안에서만 허용한다 — 그 함수가
--    set_config('winning.refund_completing', <id>, true) 를 세우고 이
--    트리거가 그 값을 확인하는 방식. 세션 변수가 없거나 다른 id 면 예외.
--    근거 — 제네릭 PATCH(refund_requests_admin_update_all RLS, sql/59)를
--    남겨 두면 (i)이중 환불 (ii)권한 미회수 (iii)소비 재판정 없음 세
--    갈래가 각각 다시 열린다(R3 재현 근거, 팀 리드 지시).
-- ---------------------------------------------------------------------
create or replace function public.refund_requests_guard_direct_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if current_setting('winning.refund_completing', true) is distinct from new.id::text then
      raise exception 'refund_completion_direct_update_blocked' using errcode = 'WC038';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.refund_requests_guard_direct_completion() is
  'status 가 completed 로 전이되는 UPDATE 를 fn_complete_refund 경유만 허용한다(WC038). 그 함수가 트랜잭션 로컬 세션 변수(winning.refund_completing = 그 행의 id)를 먼저 세팅하고, 이 트리거가 그 값이 지금 UPDATE 되는 행의 id 와 일치하는지 확인한다. 세션 변수 부재(NULL, 어드민 화면 직접 PATCH 등)나 다른 id 면 거부한다(sql/69 5-f절).';

drop trigger if exists refund_requests_guard_direct_completion_trg on public.refund_requests;
create trigger refund_requests_guard_direct_completion_trg
  before update on public.refund_requests
  for each row execute function public.refund_requests_guard_direct_completion();


-- =====================================================================
-- 6) SQLSTATE 배정 — 새 코드는 WC033 부터(WC001~WC032 는 sql/55/58/59/
--    61/62/65/66/68 에서 이미 배정됨).
-- =====================================================================
--   WC033  order_not_paid                  fn_grant_program_access_for_order
--                                           (신규, R2c): orders.status <> 'paid'.
--   WC034  order_not_approved               fn_grant_program_access_for_order
--                                           (신규, R2c): approval_status <>
--                                           'approved'. 도달 불가에 가까운
--                                           방어적 가드 — orders_approval_
--                                           before_payment_check(3절)가
--                                           approval_status<>approved 인
--                                           주문을 항상 status<>paid 로
--                                           묶어 WC033 이 먼저 걸린다(팀
--                                           리드 E2E 실측, 2026-08-12b).
--   WC035  refund_not_approved_for_completion  fn_complete_refund(신규):
--                                           refund_requests.approval_status
--                                           <> 'approved'.
--   WC036  refund_completion_not_processable   fn_complete_refund(신규):
--                                           status 가 requested/processing
--                                           이 아님(이미 completed 등,
--                                           멱등 아닌 명시적 거부).
--   WC037  refund_amount_exceeds_paid       fn_complete_refund + fn_request_
--                                           refund(신규, 공통): 완료 누적액
--                                           (+이번 금액)이 orders.amount 를
--                                           초과.
--   WC038  refund_completion_direct_update_blocked  refund_requests_guard_
--                                           direct_completion 트리거(신규):
--                                           fn_complete_refund 를 거치지
--                                           않은 status=completed 직접 UPDATE.
--
--   이관/재배정(신규 아님 — 함수가 옮겨가며 같은 코드가 새 위치에서 쓰임):
--     WC019 enrollment_pair_required / WC020 enrollment_pair_same_profile
--       sql/68 fn_redeem_coupons → sql/69 fn_request_enrollment.
--     WC031 coupon_per_user_cap_exceeded
--       sql/68 fn_redeem_coupons → sql/69 fn_respond_enrollment.
--     WC032 order_already_consumed
--       sql/68 fn_request_refund(유지) + sql/69 fn_complete_refund(신규
--       재사용, 같은 의미의 재검증이라 새 코드를 만들지 않았다).
--
--   폐기(DEPRECATED) — 더 이상 어떤 함수도 던지지 않는다:
--     WC024 coupon_revalidation_failed
--       sql/68 fn_respond_enrollment 가 fn_revalidate_order_coupons 를
--       호출해 재검증하던 코드. sql/69 는 수락 시점에 쿠폰을 직접
--       확정하므로(1-f절) 재검증 자체가 무의미해져 그 호출을 제거했다.
--
--   변경 없음(재사용, 그대로 유지 — sql/59/68 원문과 같은 의미):
--     WC001 invalid_amount (fn_request_enrollment/fn_respond_enrollment)
--     WC005 order_not_found_or_not_owned / WC006 order_not_refundable /
--     WC007 duplicate_refund_request (fn_request_refund)
--     WC010 order_not_found / WC011 order_user_mismatch /
--     WC012 product_entitlement_spec_missing
--       (fn_grant/revoke_program_access_for_order, fn_complete_refund 도
--        WC010 재사용)
--     WC021~WC023/WC025 (fn_respond_enrollment 응답 게이트)
--     WC026~WC029 (fn_respond_refund, WC026 은 fn_complete_refund 도 재사용)
--     WC030 (fn_usable_coupons/fn_coupon_by_code, 이 파일에서 변경 없음)
--     42501 not_authorized (fn_complete_refund, sql/55 fn_void_coupon_
--       redemption 과 동일 관례)
-- =====================================================================


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) 미승인 주문에 부여 시도 → 거부(WC033/WC034).
--   -- approval_status='requested' 인 주문(요청만 하고 수락 안 된 건)에
--   -- select public.fn_grant_program_access_for_order('<그 order_id>', '<parent uuid>');
--   -- 를 service_role 로 직접 호출 → WC033(orders.status<>'paid') 로 거부돼야 한다.
--   -- approval_status='approved' 로 만든 뒤 orders.status 를 'pending' 으로
--   -- 되돌려 같은 호출을 하면 여전히 WC033 이어야 하고, status 를 'paid' 로
--   -- 두고 approval_status 만 'requested' 로 되돌리면 WC034 여야 한다.
--
-- V2) 반려 주문에 부여 시도 → 거부.
--   -- fn_respond_enrollment(order_id, false, '사유') 로 반려한 주문은
--   -- approval_status='rejected' + status='canceled' 다 — 위 V1 과 같은
--   -- 이유로 WC033(status<>'paid')이 먼저 걸린다.
--
-- V3) 환불 완료 → 권한 회수됨 + 재신청 거부.
--   -- select public.fn_complete_refund(<refund_request_id>);
--   -- 후 program_access_grants 에서 그 주문의 살아있는 행이 0건이어야
--   -- 하고(revoked_at not null), orders.status='refunded' 여야 한다.
--   -- 같은 주문으로 fn_request_refund 를 다시 호출하면 WC037
--   -- (refund_amount_exceeds_paid) 로 거부돼야 한다.
--
-- V4) 어드민 직접 PATCH → 거부(WC038).
--   -- update public.refund_requests set status = 'completed'
--   --  where id = <어떤 requested/processing 건>;
--   -- -- fn_complete_refund 를 거치지 않았으므로 WC038 로 실패해야 한다.
--
-- V5) 수락 시 쿠폰 확정 + 금액 갱신.
--   -- fn_request_enrollment 로 주문을 만들면 orders.amount = subtotal,
--   -- discount_amount = list_amount - subtotal(쿠폰 없음)이어야 한다.
--   -- fn_respond_enrollment(order_id, true, null, array[<coupon uuid>])
--   -- 로 수락하면 orders.amount 가 쿠폰 할인만큼 줄고, discount_amount
--   -- 는 늘고, coupon_redemptions 에 행이 생겨야 한다(amount = list_amount
--   -- - discount_amount 등식은 항상 유지되는지 확인).
--
-- V6) canceled/failed 주문 쿠폰이 자동 void 되어 재사용 가능(1-e절 트리거).
--   -- 쿠폰이 확정된 주문(fn_respond_enrollment 로 수락, coupon_redemptions
--   -- 행 존재·voided_at is null)을 update orders set status='canceled'
--   -- where id=... 로 전이시키면, 그 즉시(트리거) coupon_redemptions.
--   -- voided_at 이 now(), void_reason='order_canceled' 로 채워져야 한다.
--   -- 같은 쿠폰으로 fn_usable_coupons/fn_coupon_by_code 를 다시 조회하면
--   -- eligible=true 여야 하고, 새 주문으로 fn_request_enrollment →
--   -- fn_respond_enrollment(..., array[그 coupon uuid]) 재신청·재수락이
--   -- 23505 없이 성공하고 discount_amount 에 그 쿠폰 할인이 다시 잡혀야
--   -- 한다. status='failed' 도 void_reason='order_failed' 로 동일하게
--   -- 확인한다. status='refunded' 로 전이시키는 경우는 voided_at 이
--   -- 그대로 NULL 이어야 한다(자동 void 대상 아님, 정책 확인).
--
-- V6-a) 30분 소프트 홀드 lazy 정리(1-d/1-f절)가 실제로 void 를 만드는지.
--   -- orders.status='pending' 인 주문에 대해 fn_respond_enrollment 를
--   -- 부르지 않고 coupon_redemptions 를 service_role 로 직접 INSERT 한
--   -- 뒤(voided_at null, created_at 을 now() - interval '31 minutes' 로
--   -- 백데이트), 같은 학생/학부모 쌍·같은 쿠폰으로 다른 주문에 대해
--   -- fn_respond_enrollment(..., true, null, array[그 coupon uuid]) 를
--   -- 호출하면 — 판정 루프 진입 시 그 오래된 pending 행이 void 되고
--   -- (voided_at not null, void_reason='pending_hold_expired'), 이번
--   -- 주문에 그 쿠폰이 정상 적용돼야 한다(23505 없이).
--
-- V6-b) 30분 정리가 소유자 무관 전역인지(2026-08-12c 재지시 — 회귀 수정
--   확인용, auto 쿠폰 케이스). grant_type='auto', max_redemptions=1 인
--   쿠폰을 하나 만들고, "학생A·학부모A" 주문(주문1, pending)에 service_
--   role 로 coupon_redemptions 를 직접 INSERT(user_id는 NULL, voided_at
--   null, created_at 을 now() - interval '31 minutes' 로 백데이트)해서
--   전역 발행량을 1/1로 채운다. 이 시점에 fn_coupon_global_redeemed 는
--   true(전역 소진)여야 한다. 그 뒤 전혀 다른 "학생B·학부모B" 쌍으로
--   fn_request_enrollment → fn_respond_enrollment(..., true, null,
--   array[그 coupon uuid]) 를 호출한다(주문2) — 소유자 조건이 남아있으면
--   주문1 의 redemption 이 user_id NULL 이라 정리 대상에서 빠지고 전역
--   카운트가 계속 1/1로 막혀 주문2 에 쿠폰이 안 붙어야(applied 목록에서
--   빠짐) 이 검증이 실패한 것이고, 수정이 맞다면 주문1 의 redemption 이
--   void 되고(voided_at not null, void_reason='pending_hold_expired')
--   전역 카운트가 0/1로 풀려 주문2 에 그 쿠폰이 정상 적용돼야 한다
--   (coupon_redemptions 에 주문2 행 추가, discount_amount 반영, 23505 없음).
--
-- V7) 함수 오버로드 정확히 1개씩인지(구 시그니처가 남아있지 않은지). 이 파일이
--    만지는 함수 전부를 센다(sql/68 V3 절과 같은 형태) — fn_respond_enrollment
--    가 3인자→4인자로 바뀌면서 구버전을 DROP 하지 않아 오버로드 2개가 공존한
--    결함이 dev 적용 후 실측됐다(팀 리드 지시, 2026-08-12b) — 이 쿼리가 있었으면
--    적용 전에 잡았을 것이다.
-- select proname, count(*) from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('fn_request_enrollment','fn_redeem_coupons','fn_respond_enrollment',
--                     'fn_request_refund','fn_complete_refund',
--                     'fn_grant_program_access_for_order','fn_order_consumption_state',
--                     'fn_refund_completed_amount','fn_coupon_is_redeemed',
--                     'fn_coupon_global_redeemed','fn_revalidate_order_coupons',
--                     'fn_coupon_pending_hold_minutes','orders_void_coupons_on_terminal_status',
--                     'refund_requests_guard_direct_completion')
--  group by proname;
-- -- fn_redeem_coupons 는 0행(완전히 사라짐)이어야 하고 나머지는 전부 정확히
-- -- 1행이어야 한다. 1행보다 많으면(특히 fn_respond_enrollment) 옛 signature
-- -- 가 남아 2·3인자 호출이 42725(not unique)로 죽는다.
--
-- V8) CHECK/제약 확인.
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orders'::regclass
--    and conname in ('orders_status_check','orders_approval_before_payment_check');
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.refund_requests'::regclass
--    and conname = 'refund_requests_approval_before_processing_check';
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- 미적용 — 이 파일은 작성만 완료했다(2026-08-12). 적용·검증은 팀 리드가
-- 별도로 수행한다(운영 DB(ucjlcvqvinspmrasvsug)는 이 작업 범위에서 읽기조차
-- 하지 않았다). api 배선(create-order.js/confirm-payment.js/toss-webhook.js/
-- MyPage.jsx/Admin.jsx)은 이 파일 다음 단계 — 아래 보고의 "호출부" 목록 참고.
-- =====================================================================
