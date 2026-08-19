-- =====================================================================
-- 86_enrollment_reject_approved.sql
-- 학부모가 이미 수락(approved)했지만 아직 결제하지 않은(status=pending)
-- 수강신청 건도 반려할 수 있게 한다 — 지금까지 fn_respond_enrollment(
-- sql/71)는 approval_status='requested' 인 건만 반려를 받아, 학부모가
-- 실수로 수락 버튼을 누르고 결제창을 닫아버린 뒤 그 요청을 치울 방법이
-- 결제하는 것뿐이었다(EnrollmentRequestModal 3버튼[닫기/반려/결제] 개편과
-- 짝을 이루는 서버 변경).
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- 이 파일이 하지 않는 것 (명시적 제외)
-- ---------------------------------------------------------------------
--   · 클라이언트 배선 — EnrollmentRequestModal.tsx 는 같은 작업에서 이미
--     3버튼으로 개편됐다(별도 커밋). 이 파일은 서버 게이트만 바꾼다.
--   · rejected 건의 쿠폰 재발급/복원 — void 는 그 redemption 을 "쓴 적
--     없는 것"으로 되돌릴 뿐, 쿠폰 자체를 학부모/학생에게 새로 지급하지
--     않는다(sql/55_coupon_policy.sql 104-112 확정 정책과 동일 원칙 —
--     보유 쿠폰이 살아있었다면 voided_at 이 풀려 다시 자격을 얻는다).
--   · DB 적용 — 파일만 쓴다. 적용·검증은 팀 리드가 한다.
-- =====================================================================


-- =====================================================================
-- 1) fn_respond_enrollment 재작성 — 반려 게이트를 approved 건까지 확장 +
--    approved 건 반려 시 쿠폰 redemption void·금액 원복.
--
--    시그니처·RETURNS 타입은 sql/71 원문과 동일(text, boolean, text,
--    uuid[] → TABLE(...) 7컬럼)이라 DROP 없이 CREATE OR REPLACE 로
--    교체한다(42P13 대상 아님 — sql/71 47행 주석의 DROP 사유였던 반환
--    타입 변경이 이번엔 없다).
-- ---------------------------------------------------------------------
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
  -- 신규(sql/86) — approved 건 반려 시 원복할 쿠폰 할인 합계. requested
  -- 건(쿠폰 확정 전)은 void 대상 coupon_redemptions 행이 0개라 이 값이
  -- 0으로 남아 자연히 no-op 이 된다 — 별도 분기 불필요.
  v_reject_void_amount integer := 0;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC021';
  end if;

  if v_order.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_order_parent' using errcode = 'WC022';
  end if;

  -- 신규(sql/86) — 승인 게이트와 반려 게이트를 분리한다. 승인은 지금까지
  -- 그대로 approval_status='requested' 인 건만 받는다(approved 건을 다시
  -- "승인"하는 건 의미가 없다). 반려는 requested 뿐 아니라 approved 인
  -- 건도 받는다 — 학부모가 수락은 했지만 아직 결제하지 않은(status=
  -- pending) 건을 나중에 마음을 바꿔 반려할 수 있어야 한다는 요구사항
  -- (EnrollmentRequestModal 3버튼[닫기/반려/결제] 개편). rejected/
  -- superseded(sql/85) 등 이미 종결된 건은 두 경로 모두 여전히 WC023.
  if p_approve then
    if v_order.approval_status <> 'requested' then
      raise exception 'enrollment_not_pending' using errcode = 'WC023';
    end if;
  else
    if v_order.approval_status not in ('requested', 'approved') then
      raise exception 'enrollment_not_pending' using errcode = 'WC023';
    end if;
  end if;

  -- WC040(sql/71 원문 그대로) — approval_status 게이트를 통과해도 이
  -- 함수를 거치지 않은 경로(웹훅 등)로 status 가 이미 종결됐으면 응답
  -- 대상이 아니다. 승인/반려 모두 여전히 status='pending' 인 요청에만
  -- 허용한다.
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
        -- voided_at 단일 판정, 자기 주문(p_order_id) 제외) + sql/71 —
        -- void 되는 redemption 만큼 그 pending 주문의 discount_amount/
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

      -- skipped_coupon_ids: 요청(p_coupon_ids)에는 있었지만 최종 적용
      -- 목록(v_applied_ids)에 들지 못한 id 전부. 판정 루프의 continue
      -- 지점(비활성/기간만료/최소금액 미달/미보유/이미소진/전역 소진)과
      -- stacking 단계의 continue(non-stackable 탈락·누적액 초과 충돌)를
      -- 각각 따로 추적하는 대신 "요청 - 적용" 차집합으로 한 번에 구한다
      -- — continue 사유가 늘어나도 이 계산은 그대로 맞고, 사유별 개별
      -- append 를 빠뜨릴 위험이 없다(sql/71 원문 그대로).
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

    -- 신규(sql/86) — approved 건은 승인 시점(위 p_approve=true 절)에 이미
    -- coupon_redemptions 행이 확정돼 있고 그 할인이 discount_amount/
    -- amount 에 반영돼 있을 수 있다. 반려로 종결시키는 이 건은 결제가
    -- 일어나지 않으므로 그 쿠폰을 "쓴 적 없는 것"으로 되돌려야 한다 —
    -- 살아있는(voided_at is null) redemption 을 전부 void 하고, void 한
    -- discount_amount 합만큼 아래 UPDATE 에서 orders.discount_amount 를
    -- 줄이고 amount 를 늘려 원복한다(위 30분 lazy 정리 절과 동일한 원복
    -- 등식). requested 건은 쿠폰이 확정되기 전이라 이 CTE 가 0행을
    -- 갱신하므로 v_reject_void_amount 가 0으로 남아 자연히 no-op 이다.
    -- ⚠ 이 함수는 RETURNS TABLE 의 out-param 으로 discount_amount/amount 라는
    --   PL/pgSQL 변수를 갖는다 — 아래 SQL 에서 같은 이름을 무한정으로 쓰면
    --   42702(ambiguous column reference)가 난다. CTE 결과와 orders 갱신식
    --   양쪽 모두 반드시 별칭으로 한정한다(첫 적용에서 실제로 터진 버그).
    with voided as (
      update public.coupon_redemptions cr
         set voided_at   = v_now,
             void_reason = 'enrollment_rejected'
       where cr.order_id = p_order_id
         and cr.voided_at is null
      returning cr.discount_amount
    )
    select coalesce(sum(v.discount_amount), 0)
      into v_reject_void_amount
      from voided v;

    -- 제약 정합(코드로 검증 불가 — 근거만 남긴다):
    --  · orders_reject_reason_pairing_check(sql/68 114-116행, (approval_
    --    status='rejected')=(reject_reason is not null)): 아래 UPDATE 가
    --    둘을 항상 함께 세팅 — 좌변/우변 모두 true.
    --  · orders_responded_at_pairing_check(sql/68 118-120행, (approval_
    --    status='requested')=(responded_at is null)): 결과 approval_
    --    status='rejected' 이므로 좌변 false, responded_at=now() 로
    --    우변도 false.
    --  · orders_approval_before_payment_check(sql/69 3절 수정본,
    --    approval_status='approved' or status in (pending,canceled,
    --    failed)): 결과 approval_status='rejected'(approved 아님)이므로
    --    좌변 false, status='canceled' 는 허용 목록 안 — 원래
    --    approval_status 가 requested 였든 approved 였든 이 UPDATE 직전
    --    status 는 위 WC040 게이트로 이미 'pending' 이 보장돼 있어 문제
    --    없다.
    --  · orders_discount_amount_check(sql/58, discount_amount>=0):
    --    v_reject_void_amount 는 쿠폰 할인분 합계일 뿐이고 discount_
    --    amount = 상품 할인 + 쿠폰 할인의 합(sql/55 182-193행 불변식,
    --    sql/71 268-272행 주석과 동일 근거)이라 쿠폰 할인분은 항상
    --    discount_amount 이하다 — 뺀 결과가 음수가 될 수 없다.
    --  · orders_amount_balance_check(sql/58, amount=list_amount-
    --    discount_amount): discount_amount 를 v_reject_void_amount 만큼
    --    줄이고 amount 를 그만큼 늘리는 대칭 갱신이라 list_amount 가
    --    불변인 한 등식이 그대로 유지된다(위 30분 lazy 정리 절, sql/71
    --    152-190행과 동일한 원복 등식).
    update public.orders o
       set approval_status  = 'rejected',
           responded_at     = now(),
           reject_reason    = p_reject_reason,
           status           = 'canceled',
           discount_amount  = o.discount_amount - v_reject_void_amount,
           amount           = o.amount + v_reject_void_amount,
           coupon_id        = null
     where o.id = p_order_id
    returning * into v_order;
  end if;

  return query
    select v_order.id, v_order.status, v_order.approval_status,
           v_order.amount, v_order.discount_amount,
           v_applied_ids, v_skipped_ids;
end;
$$;

comment on function public.fn_respond_enrollment(text, boolean, text, uuid[]) is
  '학부모가 학생의 수강신청(주문)을 수락/반려한다(sql/71 재작성 — RETURNS 를 orders 레코드에서 TABLE(단일 행: order_id/status/approval_status/amount/discount_amount/applied_coupon_ids/skipped_coupon_ids)로 변경, 2026-08-12). 응답 게이트는 WC021(주문 없음)·WC022(학부모 아님)에 신규 WC040(orders.status<>pending — 이 함수를 거치지 않은 경로로 이미 종결된 요청 재응답 차단)을 더했다. 승인(p_approve=true)은 approval_status=requested 인 건만 받는다(WC023). 반려(p_approve=false)는 requested 뿐 아니라 approved 인 건도 받는다(sql/86, WC023 재사용 — rejected/superseded 등 이미 종결된 건은 여전히 거부) — 학부모가 수락 후 아직 결제 전(status=pending)에 마음을 바꿔 반려할 수 있게 한다. 승인 시 쿠폰을 여기서 직접 확정한다(쌍 OR 자격·advisory lock·stacking·재검증 WC031, sql/69 1-f절과 동일). p_coupon_ids 중 최종 미적용 id 는 skipped_coupon_ids 로 보고한다(차집합 계산, 사유 미분류). 30분 lazy 정리로 다른 pending 주문의 coupon_redemptions 가 void 될 때 그 주문의 discount_amount/amount 도 함께 원복한다(sql/71). 반려 시 사유 필수(WC025)이며 orders.status 를 canceled 로 내린다. approved 건 반려 시 그 주문의 살아있는 coupon_redemptions 를 전부 void(void_reason=enrollment_rejected)하고 void 한 할인 합만큼 discount_amount/amount 를 원복하며 coupon_id 를 NULL 로 되돌린다(sql/86, requested 건은 void 대상 0행이라 자연히 no-op).';

revoke all on function public.fn_respond_enrollment(text, boolean, text, uuid[]) from public, anon, service_role;
grant execute on function public.fn_respond_enrollment(text, boolean, text, uuid[]) to authenticated;


-- =====================================================================
-- 2) void_reason CHECK 제약 유무 — sql 디렉토리 전체(55/58/68/69/71/85)
--    grep 결과 coupon_redemptions.void_reason 컬럼(sql/55 464-478행)에는
--    CHECK 제약이 없다(자유 text, 지금까지 쓰인 값도 order_canceled/
--    order_failed(sql/69 1-e절 트리거)/pending_hold_expired(sql/69/71
--    lazy 정리)/운영자 수기 사유(sql/55 556행 주석)로 제약 없이 다양).
--    이 파일도 별도 ALTER 없이 'enrollment_rejected' 값을 그대로 쓴다.
-- =====================================================================


-- =====================================================================
-- 3) SQLSTATE 배정 — 신규 코드 없음. 기존 WC021/WC022/WC023/WC025/WC040
--    을 그대로 재사용한다(WC001~WC056 배정 현황은 sql/71 7절·sql/85
--    5절 참고, 다음 신규 배정은 WC057부터).
-- =====================================================================


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) approved 건 반려 — 쿠폰 없이.
--   -- 쿠폰 없이 fn_respond_enrollment(..., true, null, null) 로 승인한
--   -- 주문(approval_status='approved', status='pending')에 대해 학부모
--   -- JWT 로 fn_respond_enrollment(그 order_id, false, '반려 사유', null)
--   -- 호출 → 성공, approval_status='rejected', status='canceled',
--   -- reject_reason 세팅, amount/discount_amount 변화 없음(쿠폰이 없었
--   -- 으므로).
--
-- V2) approved 건 반려 — 쿠폰 있이(금액 원복 확인).
--   -- 자격 있는 쿠폰 id 로 fn_respond_enrollment(..., true, null,
--   -- array[coupon_id]) 호출해 승인 → coupon_redemptions 에 voided_at
--   -- is null 행 1개, orders.discount_amount/amount 에 쿠폰 할인 반영
--   -- 확인. 그 뒤 같은 order_id 로 fn_respond_enrollment(..., false,
--   -- '반려', null) 호출 → 그 coupon_redemptions 행이 voided_at not
--   -- null·void_reason='enrollment_rejected' 로 바뀌고, orders.discount_
--   -- amount 는 쿠폰 할인분만큼 줄고 amount 는 그만큼 늘어 승인 전
--   -- 원래 값으로 정확히 복원돼야 한다(amount=list_amount-discount_
--   -- amount 등식 유지 확인). coupon_id 는 null.
--
-- V3) requested 건 반려 — 기존 동작 회귀 없음(no-op 원복 확인).
--   -- 승인 전(approval_status='requested') 주문을 fn_respond_enrollment
--   -- (..., false, '반려', null) 로 반려 → 기존과 동일하게 성공, void
--   -- 대상 coupon_redemptions 행이 원래 없으므로 amount/discount_amount
--   -- 변화 없음.
--
-- V4) 종결된 건 재반려 시도 → 여전히 WC023.
--   -- V1 에서 이미 rejected 로 종결된 주문에 다시 fn_respond_enrollment
--   -- (..., false, '반려', null) 호출 → WC023(enrollment_not_pending)
--   -- 으로 거부돼야 한다. superseded(sql/85) 건도 동일하게 거부돼야 한다.
--
-- V5) 승인 게이트 회귀 없음 확인.
--   -- 이미 approved 인 건에 fn_respond_enrollment(..., true, ...) 를
--   -- 다시 호출하면 여전히 WC023 으로 거부돼야 한다(반려만 확장됐고
--   -- 승인 게이트는 그대로임을 확인).
--
-- V6) WC040 회귀 없음.
--   -- approved 주문의 status 를 service_role 로 'failed' 등으로 먼저
--   -- 바꾼 뒤 fn_respond_enrollment(..., false, '반려', null) 호출 →
--   -- WC040(order_not_pending) 으로 거부돼야 한다(반려 확장이 status
--   -- 게이트를 우회하지 않음을 확인).
--
-- V7) 제약 위반 없음 확인 — V2 시나리오 실행 후.
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orders'::regclass
--    and conname in ('orders_reject_reason_pairing_check',
--                     'orders_responded_at_pairing_check',
--                     'orders_approval_before_payment_check',
--                     'orders_discount_amount_check',
--                     'orders_amount_balance_check');
-- -- V2 반려 결과 행이 위 5개 CHECK 모두 위반 없이 통과해야 한다.
--
-- V8) 함수 오버로드 정확히 1개인지.
-- select proname, count(*) from pg_proc
--  where pronamespace = 'public'::regnamespace and proname = 'fn_respond_enrollment'
--  group by proname;
-- -- 정확히 1행이어야 한다(CREATE OR REPLACE 라 DROP 을 안 했으므로
-- -- 오버로드가 새로 생길 이유는 없지만, sql/69 적용 직후 사고(sql/71
-- -- 45-47행 주석) 재발 여부를 습관적으로 확인한다).
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- 2026-08-19 dev(gjowqdiopinhixfivnkx)·prod(ykrpjcsubmbenfcnwlzd) 적용
-- 완료(Management API database/query). 첫 적용본은 반려 절의 무한정
-- discount_amount/amount 참조가 RETURNS TABLE out-param 과 충돌해
-- 42702 로 실패했다 — 별칭 한정으로 수정한 본 판본을 양쪽에 재적용했고,
-- dev 에서 approved 건 실반려 E2E(orders 가 rejected/canceled/사유 기록
-- 으로 전이)까지 확인했다.
-- =====================================================================
