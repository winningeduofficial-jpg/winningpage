-- 환불 갭 보강(팀 리드 검토 후 확정, qa-payment 후속, 20260822000001 의 후행 작업).
--
-- ① fn_request_refund(학부모 직접 신청 경로)에도 fn_respond_refund와 같은
--    WC058 게이트를 건다. 학부모 본인 신청은 즉시 approved 로 들어가
--    (refund_requests_parent_auto_approve_check) 학생 신청처럼 나중에
--    학부모 승인 단계에서 계좌를 받을 기회가 없다 — 그 주문이 가상계좌
--    결제면 신청 시점에 바로 막아야 한다. 학생이 신청해 requested 로 들어가는
--    경로(v_status <> 'approved')는 이 게이트 대상이 아니다(계좌는
--    fn_respond_refund 승인 시점에 받는다).
-- ② 계좌번호는 숫자만 남긴 뒤 빈 값인지 판정한다 — 하이픈만 입력해도
--    btrim 만으로는 "값이 있다"로 오판된다(토스 결제취소 API의
--    refundReceiveAccount.accountNumber 는 숫자만 최대 20자를 요구한다,
--    api/complete-refund.ts 도 같은 이유로 방어적 필터를 건다).
--
-- 인자 목록이 이번에 바뀌지 않으므로 CREATE OR REPLACE로 충분하다(DROP은
-- 인자 개수가 달라질 때만 필요하다, 20260822000001 주석 참고).
CREATE OR REPLACE FUNCTION "public"."fn_request_refund"(
    "p_order_id" "text",
    "p_reason" "text",
    "p_refund_bank" "text" DEFAULT NULL::"text",
    "p_refund_account" "text" DEFAULT NULL::"text",
    "p_refund_holder" "text" DEFAULT NULL::"text"
) RETURNS "public"."refund_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order              public.orders;
  v_row                public.refund_requests;
  v_caller             uuid := auth.uid();
  v_status             text;
  v_resp_at            timestamptz;
  v_completed_amount   integer;
  v_quote              record;
  v_is_virtual_account boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id, 100));

  select * into v_order from public.orders where id = p_order_id;

  -- 쌍 당사자면 누구나 신청할 수 있다(sql/74 가 좁혔던 것을 되돌린다).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- (sql/88, WC057) 학부모가 한 번 반려한 주문은 환불 축이 종결이다.
  -- 학생 재신청뿐 아니라 학부모 본인 신청도 막는다(반려는 "이 주문은 환불
  -- 하지 않는다"는 결정이므로 경로를 가리지 않는다). order_item_id is null
  -- 축(주문 전체 환불)만 본다 — 항목 단위 환불 축이 생기면 그때 별도 판단.
  if exists (
    select 1 from public.refund_requests
     where order_id = p_order_id
       and order_item_id is null
       and approval_status = 'rejected'
  ) then
    raise exception 'refund_request_parent_rejected' using errcode = 'WC057';
  end if;

  if exists (
    select 1 from public.refund_requests
     where order_id = p_order_id
       and order_item_id is null
       and status in ('requested', 'processing')
       and approval_status <> 'rejected'
  ) then
    raise exception 'duplicate_refund_request' using errcode = 'WC007';
  end if;

  v_completed_amount := public.fn_refund_completed_amount(p_order_id);
  if v_completed_amount >= v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s orders.amount=%s',
                              p_order_id, v_completed_amount, v_order.amount);
  end if;

  -- 제33조 산정(sql/72) — 화면이 보여준 것과 같은 함수.
  select * into v_quote from public.fn_refund_quote(p_order_id);

  -- 승인축 — 학생 신청은 학부모 확인 대기, 학부모(결제자) 신청은 즉시 승인
  -- (refund_requests_parent_auto_approve_check 가 요구하는 값이다).
  if v_caller = v_order.parent_profile_id then
    v_status  := 'approved';
    v_resp_at := now();
  else
    v_status  := 'requested';
    v_resp_at := null;
  end if;

  -- 신규(WC058, 2026-08-22) — 학부모 본인 신청이 즉시 approved 로 들어가는
  -- 이 경로는 fn_respond_refund 같은 나중 승인 단계가 없다. 그 주문이
  -- 가상계좌 결제면 여기서 바로 막는다. 계좌번호는 숫자만 남긴 뒤
  -- 판정한다(RefundAccountFields 가 프런트에서도 숫자만 남기지만, RPC를
  -- 직접 호출하는 경로까지 막으려면 서버도 같은 정규화를 반복해야 한다).
  if v_status = 'approved' then
    v_is_virtual_account := (v_order.raw -> 'virtualAccount') is not null
      and (v_order.raw -> 'virtualAccount') <> 'null'::jsonb;

    if v_is_virtual_account
       and (coalesce(btrim(p_refund_bank), '') = ''
            or coalesce(regexp_replace(p_refund_account, '[^0-9]', '', 'g'), '') = ''
            or coalesce(btrim(p_refund_holder), '') = '') then
      raise exception 'refund_account_required_for_virtual_account'
        using errcode = 'WC058';
    end if;
  end if;

  insert into public.refund_requests (
    user_id, order_id, order_item_id, order_name, amount, reason,
    refund_bank, refund_account, refund_holder, status,
    student_profile_id, parent_profile_id, requested_by,
    approval_status, approval_responded_at,
    gross_amount, policy_code, needs_review, quote
  ) values (
    v_caller, v_order.id, null, v_order.order_name, v_quote.refund_amount, p_reason,
    p_refund_bank, p_refund_account, p_refund_holder, 'requested',
    v_order.student_profile_id, v_order.parent_profile_id, v_caller,
    v_status, v_resp_at,
    v_quote.gross_amount, v_quote.policy_code, v_quote.needs_review, v_quote.lines
  )
  returning * into v_row;

  return v_row;
end;
$$;

COMMENT ON FUNCTION "public"."fn_request_refund"("p_order_id" "text", "p_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text") IS '환불 신청 생성(sql/88 — sql/75 원문에 WC057 게이트 추가, 2026-08-22 WC058 게이트 추가). 그 주문의 학생 또는 학부모가 신청할 수 있고, 학생 신청은 approval_status=requested(학부모 확인 대기), 학부모 신청은 approved 로 들어간다(확정 디자인 3967:3561/3967:3944 의 2단계). 금액은 fn_refund_quote(제33조)가 정한다. 학부모가 반려한(approval_status=rejected) 이력이 있는 주문은 환불 축 종결로 보고 신규 신청을 거부한다(WC057, 사용자 확정 2026-08-19). 학부모 본인 신청(즉시 approved)이 가상계좌 결제 건이면 환불계좌 3필드가 필수다(WC058) — 이 경로는 fn_respond_refund 같은 나중 승인 단계가 없어 신청 시점에 받아야 한다. 그 외 가드는 WC005/WC006/WC007/WC037.';
