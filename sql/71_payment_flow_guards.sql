-- =====================================================================
-- 71_payment_flow_guards.sql
-- 결제 플로우 잔여 구멍 마감 — sql/69 적용 후 dev(gjowqdiopinhixfivnkx)
-- 실측으로 확인된 5가지: (1) fn_respond_enrollment 가 승인 게이트
-- (WC021~WC023) 통과 후에도 status 를 다시 보지 않아 이미 종결(failed
-- 등)된 요청을 계속 승인/반려할 수 있고, 클라이언트가 어떤 쿠폰이
-- 왜 빠졌는지 알 방법이 없으며, 30분 lazy 정리가 coupon_redemptions 는
-- void 해도 그 redemption 이 반영했던 금액을 주문에 되돌리지 않는다.
-- (2) 환불 완료(refunded) 후에도 orders.status 를 다시 바꿀 수 있는
-- DB 층 잠금이 없다. (3) fn_complete_refund 가 결제 완료 여부(orders.
-- status='paid')를 확인하지 않고도 완료 처리를 시도할 수 있다.
-- (4) fn_request_enrollment 가 auth.uid() 를 보지 않는 SECURITY DEFINER
-- 함수인데(신뢰 경계는 호출자) 쌍이 실제로 연결돼 있는지, 같은 쌍에
-- 이미 열린 요청이 있는지를 스스로 검사하지 않는다. (5) order_items
-- RLS 가 여전히 orders.user_id(=학부모) 단일 축이라 학생·관리자가
-- 자신이 속한 주문의 항목을 못 본다. program_access_grants.updated_at
-- 도 자동 갱신 트리거가 없다.
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- 이 파일이 하지 않는 것 (명시적 제외)
-- ---------------------------------------------------------------------
--   · api/request-enrollment.js 신설, 기존 api(create-order.js/confirm-
--     payment.js/toss-webhook.js)·클라이언트(MyPage.jsx/Admin.jsx) 배선
--     — 별도 작업. fn_respond_enrollment 의 RETURNS 타입이 바뀌므로
--     클라이언트 rpc 호출부는 반환 컬럼명(order_id/status/approval_
--     status/amount/discount_amount/applied_coupon_ids/skipped_coupon_
--     ids)에 맞춰 별도로 갱신해야 한다(이 파일 범위 아님).
--   · 운영 DB 접근 — 이 작업 범위에서 읽기조차 하지 않았다.
--   · DB 적용 — 파일만 쓴다. 적용·검증은 팀 리드가 한다.
--   · sql/68·69 수정 — 이미 dev 에 적용됐다. 변경은 전부 이 새 파일에서 한다.
-- =====================================================================


-- =====================================================================
-- 1) fn_respond_enrollment 재작성 — 상태 재확인(WC040) + skipped_coupon_ids
--    보고 + 30분 lazy 정리 금액 원복.
--
--    RETURNS 타입이 orders(레코드)에서 TABLE(단일 행, 신규 컬럼 포함)로
--    바뀌므로 create or replace 로는 교체할 수 없다 — 인자 목록이 같아도
--    반환 타입이 다르면 42P13(cannot change return type)로 실패한다.
--    반드시 DROP 후 재생성한다. 3인자 구시그니처(sql/68)는 sql/69 에서
--    이미 DROP 됐으므로 여기서는 4인자 시그니처만 DROP 한다 — 두 시그니처
--    모두 남지 않도록 아래 V8 로 오버로드 수를 확인할 것(sql/69 적용
--    직후 3/4인자 오버로드 2개가 공존해 학부모 수락이 42725 로 100%
--    실패했던 사고, sql/69 1-f절 주석 참고 — 같은 실수를 반복하지 않는다).
-- ---------------------------------------------------------------------
drop function if exists public.fn_respond_enrollment(text, boolean, text, uuid[]);

create or replace function public.fn_respond_enrollment(
  p_order_id      text,
  p_approve       boolean,
  p_reject_reason text default null,
  p_coupon_ids    uuid[] default null
)
returns table (
  order_id           text,
  status             text,
  approval_status    text,
  amount             integer,
  discount_amount    integer,
  applied_coupon_ids uuid[],
  skipped_coupon_ids uuid[]
)
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
  -- 5-d절과 동일 정합 원칙, sql/69 1-f절에서 이관).
  v_applied_owners     uuid[] := '{}';
  v_skipped_ids        uuid[] := '{}';
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

  -- 신규(WC040) — approval_status='requested' 는 orders_approval_before_
  -- payment_check(sql/55) 상 status 가 pending/canceled/failed 중 하나일
  -- 수 있다는 뜻일 뿐 pending 을 보장하지 않는다. 이 함수를 거치지 않은
  -- 경로(웹훅 등)로 status 만 먼저 종결됐다면 그 요청은 더는 응답 대상이
  -- 아니다 — 승인/반려 둘 다 status='pending' 인 요청에만 허용한다.
  if v_order.status <> 'pending' then
    raise exception 'order_not_pending' using errcode = 'WC040';
  end if;

  if p_approve then
    -- 요청 시점(fn_request_enrollment) 의 orders.amount 는 쿠폰 미적용
    -- subtotal 이다 — 여기서 그 값을 subtotal 정본으로 쓴다(sql/69 1-f절
    -- 근거 그대로).
    v_subtotal := v_order.amount;

    if p_coupon_ids is not null and array_length(p_coupon_ids, 1) > 0 then
      -- 1) 쿠폰 판정 (DB 쓰기는 아직 없음). 판정 축은 "쌍 OR"다 — granted
      --    는 학생 소유·미소진 우선, 아니면 학부모, 둘 다 아니면 제외.
      --    auto 는 소유 판정 없음(sql/69 1-f절과 동일).
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

        -- (coupon_id, 프로필) 쌍 락 — 순서는 역할이 아니라 프로필 id
        -- 문자열 비교로 고정한다(sql/69 1-f절과 동일).
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

        -- ② 30분 소프트 홀드 lazy 정리(sql/69 1-d/1-f절과 동일 축 — 전역,
        -- voided_at 단일 판정, 자기 주문(p_order_id) 제외) + 신규(sql/71)
        -- — void 되는 redemption 만큼 그 pending 주문의 discount_amount/
        -- amount 를 원복한다. sql/69 는 coupon_redemptions 만 정리하고 그
        -- redemption 이 반영했던 금액을 주문에 되돌리지 않아, 그 주문의
        -- amount/discount_amount 가 "이미 void 된 쿠폰 할인"을 계속 반영한
        -- 채로 남아 있었다(orders_amount_balance_check 등식 자체는 깨지지
        -- 않지만 표시 금액이 사실과 어긋난다). 한 주문에 여러 redemption
        -- 이 걸리면 합산해서 한 번에 되돌린다. o.status='pending' 인
        -- 주문만 대상이다(자기 자신 p_order_id 제외는 그대로 유지) —
        -- 이미 종결(canceled/failed)된 주문은 sql/69 1-e절 트리거가 void
        -- 를 맡고, 그 트리거는 처음부터 금액을 건드리지 않는다(주문이
        -- 이미 종결이라 discount_amount 표시가 후속 흐름에 영향을 주지
        -- 않는다는 sql/69 의 기존 결정을 그대로 따른다).
        with voided as (
          update public.coupon_redemptions cr
             set voided_at   = v_now,
                 void_reason = 'pending_hold_expired'
            from public.orders o
           where cr.order_id = o.id
             and cr.coupon_id = v_coupon.id
             and cr.order_id <> p_order_id
             and cr.voided_at is null
             and o.status = 'pending'
             and cr.created_at < v_now - (public.fn_coupon_pending_hold_minutes() || ' minutes')::interval
          returning cr.order_id, cr.discount_amount
        ),
        refund_totals as (
          select v.order_id, sum(v.discount_amount)::integer as refund_amount
            from voided v
           group by v.order_id
        )
        update public.orders o
           set discount_amount = o.discount_amount - rt.refund_amount,
               amount           = o.amount + rt.refund_amount
          from refund_totals rt
         where o.id = rt.order_id;

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

      -- 2) stacking 정산 — sql/69 원문과 동일.
      v_best_nonstack_idx := null;
      for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
        if not v_cand_stackable[v_i] then
          if v_best_nonstack_idx is null
             or v_cand_discounts[v_i] > v_cand_discounts[v_best_nonstack_idx] then
            v_best_nonstack_idx := v_i;
          end if;
        end if;
      end loop;

      -- 3) 최종 적용 목록 조립 — sql/69 원문과 동일.
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

      -- 신규(sql/71) — skipped_coupon_ids: 요청(p_coupon_ids)에는 있었지만
      -- 최종 적용 목록(v_applied_ids)에 들지 못한 id 전부. 판정 루프의
      -- continue 지점(비활성/기간만료/최소금액 미달/미보유/이미소진/전역
      -- 소진)과 stacking 단계의 continue(non-stackable 탈락·누적액 초과
      -- 충돌)를 각각 따로 추적하는 대신 "요청 - 적용" 차집합으로 한 번에
      -- 구한다 — continue 사유가 늘어나도 이 계산은 그대로 맞고, 사유별
      -- 개별 append 를 빠뜨릴 위험이 없다.
      v_skipped_ids := coalesce(
        (select array_agg(x) from (
           select unnest(p_coupon_ids)
           except
           select unnest(v_applied_ids)
         ) as t(x)),
        '{}'::uuid[]
      );
    end if;

    -- 4) 확정 금액 — 요청 시점 discount_amount(상품 단위 할인)에 쿠폰
    --    할인을 "더한다"(교체 아님) — orders.discount_amount = 상품 할인 +
    --    쿠폰 할인의 합이라는 불변식(sql/55_coupon_policy.sql:182-193)을
    --    유지해야 orders_amount_balance_check 와 감사용 분해 쿼리가 계속
    --    맞는다(sql/69 1-f절과 동일).
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

    -- 6-a) 소진 직전 재검증(WC031) — advisory lock 을 우회한 경로가 이
    --    트랜잭션과 동시에 같은 (coupon, owner) 를 소진했다는 뜻이다.
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

      -- 6-b) 쿠폰 귀속(사용 이력).
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

  return query
    select v_order.id, v_order.status, v_order.approval_status,
           v_order.amount, v_order.discount_amount,
           v_applied_ids, v_skipped_ids;
end;
$$;

comment on function public.fn_respond_enrollment(text, boolean, text, uuid[]) is
  '학부모가 학생의 수강신청(주문)을 수락/반려한다(sql/71 재작성 — RETURNS 를 orders 레코드에서 TABLE(단일 행: order_id/status/approval_status/amount/discount_amount/applied_coupon_ids/skipped_coupon_ids)로 변경, 2026-08-12). 응답 게이트는 WC021(주문 없음)·WC022(학부모 아님)·WC023(승인 대기 아님)에 신규 WC040(orders.status<>pending — 이 함수를 거치지 않은 경로로 이미 종결된 요청 재응답 차단)을 더했다. 승인 시 쿠폰을 여기서 직접 확정한다(쌍 OR 자격·advisory lock·stacking·재검증 WC031, sql/69 1-f절과 동일). p_coupon_ids 중 최종 미적용 id 는 skipped_coupon_ids 로 보고한다(차집합 계산, 사유 미분류). 30분 lazy 정리로 다른 pending 주문의 coupon_redemptions 가 void 될 때 그 주문의 discount_amount/amount 도 함께 원복한다(신규 — sql/69 는 redemption 만 void 하고 금액은 그대로 두는 결함이 있었다). 반려 시 사유 필수(WC025)이며 orders.status 를 canceled 로 내린다.';

revoke all on function public.fn_respond_enrollment(text, boolean, text, uuid[]) from public, anon, service_role;
grant execute on function public.fn_respond_enrollment(text, boolean, text, uuid[]) to authenticated;


-- =====================================================================
-- 2) orders 환불 종결 불변 트리거(WC039) — refunded 에서 다른 상태로
--    되돌아가는 UPDATE 를 DB 층에서 막는다.
--
--    근거 — refunded→paid 전이를 막는 제약·코드가 지금까지 하나도 없어
--    토스 웹훅 재전송만으로 이미 환불 완료한 주문이 paid 로 부활하고
--    fn_grant_program_access_for_order 의 restore_revoked 경로가 회수된
--    권한을 재부여하는 사고가 실측·재현됐다. status 전이 자체를 막는
--    편이 호출부(webhook/어드민 등)를 전부 찾아 고치는 것보다 안전하다
--    (sql/69 1-e절과 같은 원칙 — 트리거로 구조적으로 막는다).
-- ---------------------------------------------------------------------
create or replace function public.orders_guard_refunded_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'refunded' and new.status is distinct from 'refunded' then
    raise exception 'refunded_order_immutable' using errcode = 'WC039';
  end if;
  return new;
end;
$$;

comment on function public.orders_guard_refunded_immutable() is
  'orders.status=refunded 인 주문의 status 를 다른 값으로 되돌리는 UPDATE 를 차단한다(WC039, sql/71). refunded→paid 전이를 막는 수단이 이전까지 없어 웹훅 재전송으로 환불 완료 주문이 부활하고 회수된 program_access_grants 가 restore_revoked 로 재부여되는 경로가 실측·재현됐다.';

drop trigger if exists orders_guard_refunded_immutable_trg on public.orders;
create trigger orders_guard_refunded_immutable_trg
  before update of status on public.orders
  for each row
  when (old.status = 'refunded' and new.status is distinct from 'refunded')
  execute function public.orders_guard_refunded_immutable();


-- =====================================================================
-- 3) fn_complete_refund 재작성 — 결제 완료 상태 확인(WC041) 추가.
--    salt 100 advisory lock 획득 → 행 잠금(refund_requests/orders) →
--    상태 확인 순서는 sql/69 5-e절 원문 그대로 유지한다(잠금이 먼저,
--    그 다음 판정 — 이 순서 자체가 이미 팀 리드가 지시한 "소비 재판정을
--    advisory lock 뒤로"를 만족한다). 여기서는 orders.status='paid' 확인
--    한 단계만 승인축 확인(WC035) 앞에 추가한다.
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
  -- 직렬화). 신청/완료가 같은 주문에 동시에 들어와도 줄을 세운다. 아래
  -- 모든 상태 판정(WC035/WC036/신규 WC041/WC032/WC037)은 이 락을 획득한
  -- 뒤에만 이뤄진다.
  perform pg_advisory_xact_lock(hashtextextended(v_order_id, 100));

  select * into v_row from public.refund_requests where id = p_refund_request_id for update;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  select * into v_order from public.orders where id = v_row.order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 2) 신규(WC041) — 결제 완료 상태 확인. refund_requests 는 fn_request_
  -- refund 단계에서 이미 orders.status='paid' 를 확인했지만(WC006), 그
  -- 신청과 이 완료 사이에 orders.status 가 바뀌었을 수 있다(예: 다른
  -- 환불 건이 먼저 완료돼 refunded 로 종결 — 이 경우는 위 2)절 WC039
  -- 트리거가 이 UPDATE 자체를 막지만, 그 전에 명확한 코드로 먼저 걸러
  -- 원인이 분명하게 알린다. failed/canceled 로 바뀐 경우도 여기서 막는다).
  if v_order.status <> 'paid' then
    raise exception 'order_not_paid_for_refund' using errcode = 'WC041';
  end if;

  -- 3) 승인축 확인 — 학부모(또는 학부모 본인 신청의 자동 승인)가 승인한
  -- 건만 완료할 수 있다.
  if v_row.approval_status <> 'approved' then
    raise exception 'refund_not_approved_for_completion' using errcode = 'WC035';
  end if;

  -- 4) 처리 가능 상태 확인 — 이미 completed 면 멱등 처리하지 않고
  -- 명시적으로 거부한다. rejected 도 재완료 대상이 아니다.
  if v_row.status not in ('requested', 'processing') then
    raise exception 'refund_completion_not_processable'
      using errcode = 'WC036',
            detail  = format('refund_request_id=%s status=%s', p_refund_request_id, v_row.status);
  end if;

  -- 5) 소비 재판정 — fn_request_refund 신청 시점 이후 소비가 발생했을 수
  -- 있다(요청 → 소비 → 완료 순서 방지). 공통 함수 재사용(sql/69 5-b절).
  select * into v_consumption from public.fn_order_consumption_state(v_row.order_id);
  if v_consumption.consumed then
    raise exception 'order_already_consumed'
      using errcode = 'WC032',
            detail  = format('order_id=%s 회차소비=[%s] 기간권진입=[%s]',
                              v_row.order_id, coalesce(v_consumption.consumed_sessions, '-'), coalesce(v_consumption.consumed_period, '-'));
  end if;

  -- 6) 누적 환불액 가드 — 이 완료로 orders.amount 를 넘기면 거부(이중
  -- 환불 방지, 공통 함수 재사용 sql/69 5-c절).
  v_completed_amount := public.fn_refund_completed_amount(v_row.order_id);
  if v_completed_amount + v_row.amount > v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s this_amount=%s orders.amount=%s',
                              v_row.order_id, v_completed_amount, v_row.amount, v_order.amount);
  end if;

  -- 7) 완료 처리 — 5-f절(sql/69) 트리거가 이 UPDATE 만 허용하도록 세션
  -- 변수를 먼저 세운다(트랜잭션 로컬, is_local=true).
  perform set_config('winning.refund_completing', p_refund_request_id::text, true);

  update public.refund_requests
     set status     = 'completed',
         admin_memo = coalesce(p_admin_memo, admin_memo)
   where id = p_refund_request_id
  returning * into v_row;

  -- 8) 권한 회수.
  v_revoke_result := public.fn_revoke_program_access_for_order(
    v_row.order_id, v_order.user_id, 'refunded', 'refund_completed');

  -- 9) 주문 종결 — 위 2)절 WC039 트리거는 old.status='refunded' 일 때만
  -- 걸리므로 paid→refunded 인 이 UPDATE 는 막히지 않는다.
  update public.orders
     set status = 'refunded'
   where id = v_row.order_id;

  return v_row;
end;
$$;

comment on function public.fn_complete_refund(bigint, text) is
  '환불 완료를 한 트랜잭션에서 처리하는 단일 정본 RPC(sql/71 재작성, 2026-08-12 — sql/69 5-e절에 결제 완료 상태 확인(WC041, 신규) 추가). is_admin() 만 실행 가능(42501). salt 100 advisory lock 을 먼저 획득한 뒤 orders.status=''paid'' 확인(WC041)·승인축 확인(WC035)·처리 가능 상태 확인(WC036)·소비 재판정(WC032)·누적 환불액 가드(WC037)를 통과해야 status=completed 로 바뀌고, 그 즉시 fn_revoke_program_access_for_order 로 권한을 회수하고 orders.status=refunded 로 종결한다. refunded 종결 후 재호출은 위 orders_guard_refunded_immutable_trg(WC039)가 별도로 막는다.';

revoke all on function public.fn_complete_refund(bigint, text) from public, anon;
grant execute on function public.fn_complete_refund(bigint, text) to authenticated, service_role;


-- =====================================================================
-- 4) fn_request_enrollment 재작성 — 동시성 락(salt 101) + 링크 검증
--    (WC042) + 중복 열린 요청 차단(WC043).
--
--    이 함수는 auth.uid() 를 참조하지 않는다(sql/69 1-a절 주석 — 신뢰
--    경계는 호출자). api/request-enrollment.js(다음 단계, 이 파일 범위
--    아님)가 학생 JWT 로 학생을 확정하고 parent_child_links 를 서버에서
--    재조회해 p_parent_profile_id 를 채우기로 계약돼 있지만, 이 함수가
--    SECURITY DEFINER + service_role 전용이라는 사실만으로는 잘못된
--    쌍(버그·수동 RPC 호출)이 넘어오는 걸 막지 못한다 — DB 층 백스톱을
--    함수 초입(기본 null/동일인 검사 직후, 아직 아무 것도 쓰기 전)에 둔다.
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

  -- 쌍 필수 + 동일인 금지 — advisory lock 인자로 넘기기 전에 NULL 을
  -- 먼저 걸러낸다(pg_advisory_xact_lock 은 NULL 인자를 받으면 에러가
  -- 난다). orders_pair_distinct_check 가 결국 같은 것을 막지만, INSERT
  -- 시점의 원문 23514 보다 여기서 먼저 걸러 원인이 분명한 코드로 알린다
  -- (sql/68 5-d절과 동일 근거, sql/69 1-a절에서 이관).
  if p_student_profile_id is null or p_parent_profile_id is null then
    raise exception 'enrollment_pair_required' using errcode = 'WC019';
  end if;
  if p_student_profile_id = p_parent_profile_id then
    raise exception 'enrollment_pair_same_profile' using errcode = 'WC020';
  end if;

  -- 신규(sql/71) — 학생 축 advisory lock. 동시에 들어온 같은 학생의
  -- 요청 두 건이 아래 WC043 중복 검사를 동시에 통과해 열린 요청이 둘
  -- 생기는 경합(TOCTOU)을 막는다. 학부모 축이 아니라 학생 축을 잠그는
  -- 이유 — 한 학생은 항상 최대 하나의 승인 대기 요청만 가져야 하지만,
  -- 한 학부모는 여러 자녀를 동시에 신청시킬 수 있어 부모 축으로 잠그면
  -- 서로 다른 학생의 정상 동시 요청까지 불필요하게 직렬화된다.
  perform pg_advisory_xact_lock(hashtextextended(p_student_profile_id::text, 101));

  -- 신규(sql/71, WC042) — 두 프로필이 실제로 approved 상태로 연결돼
  -- 있는지 재검증(sql/68 5-g절 fn_is_linked_pair, SECURITY DEFINER 헬퍼
  -- 재사용 — parent_child_links RLS 를 직접 참조하지 않는다).
  if not public.fn_is_linked_pair(p_student_profile_id, p_parent_profile_id) then
    raise exception 'pair_not_linked' using errcode = 'WC042';
  end if;

  -- 신규(sql/71, WC043) — 같은 (학생, 학부모) 쌍에 이미 승인 대기 중인
  -- 주문이 있으면 새 요청을 막는다. status='pending' and approval_status
  -- ='requested' 를 함께 보는 이유 — 반려(status=canceled 로 종결)·수락
  -- (approval_status=approved)된 과거 주문은 더는 "열린 요청"이 아니라
  -- 새 요청을 막을 이유가 없다.
  if exists (
    select 1 from public.orders o
     where o.student_profile_id = p_student_profile_id
       and o.parent_profile_id  = p_parent_profile_id
       and o.status = 'pending'
       and o.approval_status = 'requested'
  ) then
    raise exception 'duplicate_open_request' using errcode = 'WC043';
  end if;

  v_discount_amount := p_list_amount - p_subtotal;
  v_amount          := p_subtotal;

  -- 0원 이하 주문 차단 — orders_amount_check(amount > 0)가 있으니 그
  -- 원문 23514 대신 여기서 먼저 명확한 코드로 막는다.
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

  -- 주문 아이템.
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
  '학생이 수강신청(주문)을 생성한다(sql/71 재작성, 2026-08-12 — sql/69 1-a절에 동시성 락 + 링크 검증 + 중복 요청 차단 추가). 함수 초입(입력 null 검사 직후)에 학생 프로필 축 advisory lock(salt 101)을 먼저 획득해 동시 이중 신청을 직렬화하고, fn_is_linked_pair 로 쌍이 실제로 approved 링크인지 재검증(WC042)한 뒤, 같은 (학생,학부모) 쌍에 status=pending and approval_status=requested 인 열린 요청이 이미 있으면 거부한다(WC043). auth.uid() 는 참조하지 않는다(신뢰 경계는 호출자 — api/request-enrollment.js 가 학생 JWT 로 학생을 확정하고 parent_child_links 를 서버에서 재조회해 이 인자를 채운다). 그 외(쌍 필수 WC019·동일인 금지 WC020·0원 이하 차단 WC001·orders/order_items INSERT)는 sql/69 원문과 동일.';

revoke all on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer)
  to service_role;


-- =====================================================================
-- 5) order_items RLS — orders.user_id(=학부모) 단일 축을 쌍+관리자 축으로
--    교체. 기존 정책(sql/00_base_schema.sql:1969-1970, sql/10_pricing_
--    orders.sql:141-148)은 o.user_id = auth.uid() 만 보고 있어 학생과
--    관리자가 자신이 속한 주문의 항목을 조회하지 못했다(orders 자체는
--    이미 쌍+admin 축으로 갱신돼 있는 것과 어긋난 상태였다).
-- ---------------------------------------------------------------------
drop policy if exists "order_items select own" on public.order_items;
create policy "order_items select own" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and (auth.uid() = o.student_profile_id
              or auth.uid() = o.parent_profile_id
              or public.is_admin())
    )
  );

comment on policy "order_items select own" on public.order_items is
  '그 주문의 학생·학부모 또는 관리자만 order_items 를 조회한다(sql/71 — orders.user_id 단일 축에서 쌍+admin 축으로 교체, orders 테이블의 "orders select own" 정책과 축을 맞춤). INSERT/UPDATE/DELETE 정책은 여전히 0개 — 쓰기는 service_role/SECURITY DEFINER RPC 경유만 가능.';


-- =====================================================================
-- 6) program_access_grants.updated_at 자동 갱신 트리거 — 기존 공용 헬퍼
--    (public.set_updated_at(), 00_base_schema.sql:1432, banners 등 30여
--    테이블이 이미 쓰는 정본)를 재사용한다. 새 함수를 만들지 않는다.
--    네이밍은 trg_<table>_updated_at 관례(00_base_schema.sql:1489
--    trg_banners_updated_at 등)를 따른다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_program_access_grants_updated_at on public.program_access_grants;
create trigger trg_program_access_grants_updated_at
  before update on public.program_access_grants
  for each row execute function public.set_updated_at();


-- =====================================================================
-- 7) SQLSTATE 배정 — 새 코드는 WC039 부터(WC001~WC038 은 sql/55/58/59/
--    61/62/65/66/68/69 에서 이미 배정됨, WC024 는 sql/69 에서 폐기).
-- =====================================================================
--   WC039  refunded_order_immutable        orders_guard_refunded_immutable
--                                           트리거(신규): old.status=
--                                           'refunded' 인데 new.status 가
--                                           다름(환불 종결 후 상태 되돌림).
--   WC040  order_not_pending               fn_respond_enrollment(신규):
--                                           승인 게이트(WC021~WC023) 통과
--                                           후에도 orders.status<>'pending'
--                                           (이 함수를 거치지 않은 경로로
--                                           이미 종결됨).
--   WC041  order_not_paid_for_refund       fn_complete_refund(신규):
--                                           orders.status<>'paid'.
--   WC042  pair_not_linked                 fn_request_enrollment(신규):
--                                           fn_is_linked_pair(student,
--                                           parent) 가 false(approved 링크
--                                           아님).
--   WC043  duplicate_open_request          fn_request_enrollment(신규):
--                                           같은 (student,parent) 쌍에
--                                           status='pending' and approval_
--                                           status='requested' 인 주문이
--                                           이미 존재.
--
--   변경 없음(재사용, 그대로 유지) — WC001/WC005~WC007/WC010~WC012/
--   WC019~WC023/WC025/WC026~WC030/WC031/WC032/WC035~WC038, 42501.
-- =====================================================================


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) WC040 — 이미 status<>'pending' 인 requested 주문에 응답 시도 → 거부.
--   -- approval_status='requested' 인 주문을 하나 골라 service_role 로
--   -- update public.orders set status='failed' where id='<그 order_id>';
--   -- (WC039 트리거는 old.status='refunded' 일 때만 걸리므로 pending→
--   -- failed 는 통과한다) 그 뒤 학부모 JWT 로
--   -- select public.fn_respond_enrollment('<그 order_id>', true, null, null);
--   -- 를 호출하면 WC040(order_not_pending) 으로 거부돼야 한다.
--
-- V2) skipped_coupon_ids + 30분 lazy 정리 금액 원복.
--   -- 자격이 안 되는 쿠폰 id(예: min_amount 미달)와 자격이 되는 쿠폰
--   -- id 를 함께 p_coupon_ids 로 넘겨 fn_respond_enrollment(..., true,
--   -- null, array[...]) 호출 → 반환 행의 skipped_coupon_ids 에 전자만,
--   -- applied_coupon_ids 에 후자만 있어야 한다.
--   -- 별도로 다른 pending 주문에 같은 쿠폰의 coupon_redemptions 를
--   -- service_role 로 직접 INSERT(voided_at null, created_at 을 now() -
--   -- interval '31 minutes' 로 백데이트)한 뒤, 그 pending 주문의
--   -- amount/discount_amount 를 기록해 두고, 다른(제3의) 주문에 대해
--   -- 그 쿠폰으로 fn_respond_enrollment 를 호출하면 — 그 pending 주문의
--   -- coupon_redemptions 가 void 되고(voided_at not null), discount_
--   -- amount 는 그 redemption.discount_amount 만큼 줄고 amount 는 그만큼
--   -- 늘어야 한다(amount = list_amount - discount_amount 등식 유지 확인).
--
-- V3) WC039 — 환불 완료 주문 상태 되돌리기 시도 → 거부.
--   -- fn_complete_refund 로 완료해 orders.status='refunded' 가 된 주문에
--   -- service_role 로 update public.orders set status='paid' where id=...
--   -- 를 실행하면 WC039(refunded_order_immutable) 로 거부돼야 한다.
--   -- status='refunded' 를 유지한 채 다른 컬럼만 바꾸는 UPDATE 는 여전히
--   -- 성공해야 한다(트리거 조건이 status 값 변화에만 걸림 확인).
--
-- V4) WC041 — 미결제 주문의 환불 요청을 억지로 완료 시도 시 거부.
--   -- (정상 경로로는 fn_request_refund 가 WC006 으로 먼저 막지만) 이미
--   -- approved 된 refund_requests 행을 만든 뒤 그 주문 orders.status 를
--   -- service_role 로 'pending' 등 'paid' 아닌 값으로 바꾸고
--   -- select public.fn_complete_refund(<그 refund_request_id>);
--   -- 를 호출하면 WC041(order_not_paid_for_refund) 로 거부돼야 한다.
--
-- V5) WC042/WC043 — fn_request_enrollment 신규 가드.
--   -- 연결되지 않은 임의의 두 프로필 uuid 로 fn_request_enrollment 를
--   -- 호출하면 WC042(pair_not_linked) 로 거부돼야 한다. 연결된 쌍으로
--   -- 정상 요청을 하나 만든 뒤(approval_status='requested' 로 남겨둔
--   -- 채) 같은 쌍으로 다시 fn_request_enrollment 를 호출하면 WC043
--   -- (duplicate_open_request) 으로 거부돼야 한다. 그 첫 요청을
--   -- fn_respond_enrollment 로 수락/반려한 뒤에는 같은 쌍으로 새 요청이
--   -- 23514/WC043 없이 성공해야 한다.
--
-- V6) order_items RLS — 학생/관리자 조회 가능 확인.
--   -- 학생 JWT 로 자신이 속한 주문의 order_items 를 select 하면 행이
--   -- 보여야 한다(교체 전에는 0행이었다). 무관한 제3자 JWT 로는 여전히
--   -- 0행이어야 한다.
--
-- V7) program_access_grants.updated_at 자동 갱신 확인.
--   -- 살아있는 부여 하나를 아무 컬럼이나(예: memo) service_role 로
--   -- update 하면 updated_at 이 now() 로 바뀌어야 한다.
--
-- V8) 함수 오버로드 정확히 1개씩인지(구 시그니처가 남아있지 않은지) —
--    sql/69 V7절과 같은 형태. 이 파일이 만지는 함수 전부를 센다.
-- select proname, count(*) from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('fn_respond_enrollment','fn_complete_refund',
--                     'fn_request_enrollment','orders_guard_refunded_immutable')
--  group by proname;
-- -- 전부 정확히 1행이어야 한다. fn_respond_enrollment 가 1행보다 많으면
-- -- 옛 4인자 반환타입(orders 레코드) 오버로드가 DROP 되지 않고 남아
-- -- 42725(not unique)로 죽는다(sql/69 적용 직후 실제로 있었던 사고와
-- -- 같은 종류).
--
-- V9) CHECK/트리거 확인.
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orders'::regclass and conname = 'orders_status_check';
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--  where tgrelid = 'public.orders'::regclass and not tgisinternal;
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--  where tgrelid = 'public.program_access_grants'::regclass and not tgisinternal;
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- 미적용 — 이 파일은 작성만 완료했다(2026-08-12). 적용·검증은 팀 리드가
-- 별도로 수행한다(운영 DB(ucjlcvqvinspmrasvsug)는 이 작업 범위에서 읽기조차
-- 하지 않았다). api 배선(request-enrollment.js 신설·기존 api·MyPage.jsx/
-- Admin.jsx 클라이언트 rpc 응답 컬럼 갱신)은 이 파일 다음 단계.
-- =====================================================================
