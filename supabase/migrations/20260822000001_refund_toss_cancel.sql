-- 환불 완료 처리가 토스 결제취소 API 성공을 전제로 하도록 배선한다(qa-payment
-- 후속 작업, 환불 갭 2건 해결 확정 설계).
--
-- ① refund_requests.toss_cancel — api/complete-refund.ts 가 토스 취소 API
--    (POST /v1/payments/{paymentKey}/cancel) 응답 원본을 저장하는 컬럼.
--    fn_complete_refund 는 이 컬럼을 읽지 않는다 — 판정 로직(환불 가능 여부·
--    금액)의 정본은 여전히 fn_refund_quote/fn_complete_refund 이고, 이 컬럼은
--    "실제로 토스에 취소를 넣었다"는 증빙만 남긴다(판정 로직 복제 금지 원칙).
ALTER TABLE "public"."refund_requests"
  ADD COLUMN IF NOT EXISTS "toss_cancel" "jsonb";

COMMENT ON COLUMN "public"."refund_requests"."toss_cancel" IS '토스 결제취소 API(POST /v1/payments/{paymentKey}/cancel) 응답 원본, 또는 재클릭 시 GET 조회로 확인한 기취소 항목(api/complete-refund.ts). fn_complete_refund 는 이 컬럼을 보지 않는다 — 취소 성공 여부의 증빙일 뿐 상태 전이 판정에는 쓰이지 않는다.';

-- ② fn_respond_refund — 학생이 신청한 환불을 학부모가 승인할 때, 그 주문이
--    가상계좌 결제면 환불계좌(은행/계좌번호/예금주) 3필드를 함께 받는다.
--    학부모 본인 직접 신청 경로(fn_request_refund)는 이미 이 3필드 파라미터가
--    있어(sql/75) 이번 변경 대상이 아니다 — 여기는 "학생이 신청 → 학부모가
--    승인 시점에 계좌를 나중에 보태는" 경로 전용이다.
--
--    기존 3-인자 시그니처(bigint, boolean, text)에 CREATE OR REPLACE 로 인자
--    3개를 추가하면 Postgres 가 인자 개수가 다른 별도 함수로 취급해 같은
--    이름의 오버로드 두 개가 공존하게 되고, PostgREST 가 RPC 호출 시 "Could
--    not choose the best candidate function" 으로 충돌한다. DROP 후 재생성해
--    오버로드가 하나만 남게 한다.
DROP FUNCTION IF EXISTS "public"."fn_respond_refund"(bigint, boolean, "text");

CREATE FUNCTION "public"."fn_respond_refund"(
    "p_refund_request_id" bigint,
    "p_approve" boolean,
    "p_reject_reason" "text" DEFAULT NULL::"text",
    "p_refund_bank" "text" DEFAULT NULL::"text",
    "p_refund_account" "text" DEFAULT NULL::"text",
    "p_refund_holder" "text" DEFAULT NULL::"text"
) RETURNS "public"."refund_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_row                public.refund_requests;
  v_order              public.orders;
  v_is_virtual_account boolean;
begin
  select * into v_row from public.refund_requests where id = p_refund_request_id for update;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  if v_row.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_refund_parent' using errcode = 'WC027';
  end if;

  if v_row.approval_status <> 'requested' then
    raise exception 'refund_not_pending' using errcode = 'WC028';
  end if;

  if p_approve then
    -- 신규(WC058) — 가상계좌 결제 건은 환불계좌 없이는 실제로 돈을 돌려줄
    -- 수단이 없다(토스 결제취소 API가 가상계좌 취소에 refundReceiveAccount를
    -- 요구한다, api/complete-refund.ts). 화면(RefundApprovalModal)이 이미
    -- 필수 입력으로 막지만, 화면과 DB가 다른 답을 하면 안 된다는 이 저장소의
    -- 원칙(fn_refund_quote 주석 참고)에 따라 서버도 같은 판정을 반복한다.
    --
    -- 계좌번호는 숫자만 남긴 뒤 빈 값인지 판정한다(fn_request_refund와 동일
    -- 판정, 20260822000002) — 하이픈만 입력해도 btrim 만으로는 "값이 있다"로
    -- 오판된다.
    select * into v_order from public.orders where id = v_row.order_id;
    v_is_virtual_account := (v_order.raw -> 'virtualAccount') is not null
      and (v_order.raw -> 'virtualAccount') <> 'null'::jsonb;

    if v_is_virtual_account
       and (coalesce(btrim(p_refund_bank), '') = ''
            or coalesce(regexp_replace(p_refund_account, '[^0-9]', '', 'g'), '') = ''
            or coalesce(btrim(p_refund_holder), '') = '') then
      raise exception 'refund_account_required_for_virtual_account'
        using errcode = 'WC058';
    end if;

    update public.refund_requests
       set approval_status        = 'approved',
           approval_responded_at  = now(),
           refund_bank            = coalesce(p_refund_bank, refund_bank),
           refund_account         = coalesce(p_refund_account, refund_account),
           refund_holder          = coalesce(p_refund_holder, refund_holder)
     where id = p_refund_request_id
    returning * into v_row;
  else
    if coalesce(btrim(p_reject_reason), '') = '' then
      raise exception 'reject_reason_required' using errcode = 'WC029';
    end if;

    update public.refund_requests
       set approval_status         = 'rejected',
           approval_responded_at   = now(),
           approval_reject_reason  = p_reject_reason
       -- status(어드민 처리축)는 건드리지 않는다 — refund_requests_approval_
       -- before_processing_check 상 이미 'requested' 로 고정돼 있고, 학생은
       -- 3)절 부분 유니크 인덱스 대상에서 이 행이 빠지는 즉시(approval_status
       -- <> 'requested' 가 되는 순간) 같은 주문으로 재신청할 수 있다.
     where id = p_refund_request_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

ALTER FUNCTION "public"."fn_respond_refund"(bigint, boolean, "text", "text", "text", "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."fn_respond_refund"(bigint, boolean, "text", "text", "text", "text") IS '학부모가 학생이 신청한 환불(approval_status=requested)에 응답한다(sql/68 신규, 2026-08-22 환불계좌 3필드 추가). 호출자는 그 신청의 parent_profile_id 여야 한다(WC027). 반려 시 사유 필수(WC029). 승인 시 그 주문이 가상계좌 결제면 환불계좌 3필드가 함께 필수다(WC058) — fn_request_refund(학부모 직접 신청)와 달리 이 경로는 학생이 낸 신청에 학부모가 승인 시점에 계좌를 보탠다. status(어드민 처리축)는 건드리지 않는다.';

REVOKE ALL ON FUNCTION "public"."fn_respond_refund"(bigint, boolean, "text", "text", "text", "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_respond_refund"(bigint, boolean, "text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_respond_refund"(bigint, boolean, "text", "text", "text", "text") TO "service_role";
