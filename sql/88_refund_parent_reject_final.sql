-- =====================================================================
-- 88_refund_parent_reject_final.sql
-- 학부모가 반려한 환불 요청은 종결이다 — 같은 주문으로 다시 환불을
-- 신청할 수 없다(사용자 확정, 2026-08-19). 지금까지는 반대였다:
-- sql/68 이 미종결 판정에서 approval_status='rejected' 를 빼고 sql/75 의
-- WC007 중복 가드도 rejected 건을 제외해 "반려는 '이번엔 안 된다'일 뿐,
-- 재신청이 열려 있다"는 설계였다. 이 파일이 그 결정을 뒤집는다 —
-- 반려 이력이 있는 주문은 신규 환불 신청 자체를 거부한다(WC057).
-- 화면(결제 상세 모달 학생/학부모 양쪽)의 환불 신청 버튼도 같은 작업에서
-- refund_parent_rejected 상태에 숨긴다(별도 커밋).
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- 이 파일이 하지 않는 것 (명시적 제외)
-- ---------------------------------------------------------------------
--   · 기존 반려 이력 데이터 정리 — refund_requests 의 rejected 행은
--     그대로 둔다(이력이 곧 차단 근거다).
--   · 어드민 경로 — service_role/어드민 화면의 환불 처리에는 손대지
--     않는다. 이 게이트는 fn_request_refund(당사자 신청 경로)에만 있다.
--   · DB 적용 — 파일만 쓴다. 적용·검증은 팀 리드가 한다.
-- =====================================================================


-- =====================================================================
-- 1) fn_request_refund 재작성 — 반려 이력 종결 게이트(WC057) 추가.
--    sql/75 원문에 WC007 가드 직전의 WC057 게이트 하나만 더한다. 그 외
--    로직(쌍 당사자 신청 WC005, paid 전용 WC006, 중복 WC007, 완납 초과
--    WC037, 제33조 산정, 학생=requested/학부모=approved 승인축)은 sql/75
--    원문 그대로다. 시그니처·RETURNS 불변이라 CREATE OR REPLACE 로 교체.
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
  v_completed_amount  integer;
  v_quote             record;
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

  -- 신규(sql/88, WC057) — 학부모가 한 번 반려한 주문은 환불 축이 종결이다.
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

comment on function public.fn_request_refund(text, text, text, text, text) is
  '환불 신청 생성(sql/88 — sql/75 원문에 WC057 게이트 추가). 그 주문의 학생 또는 학부모가 신청할 수 있고, 학생 신청은 approval_status=requested(학부모 확인 대기), 학부모 신청은 approved 로 들어간다(확정 디자인 3967:3561/3967:3944 의 2단계). 금액은 fn_refund_quote(제33조)가 정한다. 학부모가 반려한(approval_status=rejected) 이력이 있는 주문은 환불 축 종결로 보고 신규 신청을 거부한다(WC057, 사용자 확정 2026-08-19 — sql/68·75 의 "반려 후 재신청 허용" 결정을 뒤집음). 그 외 가드는 WC005/WC006/WC007/WC037.';

revoke all on function public.fn_request_refund(text, text, text, text, text) from public, anon;
grant execute on function public.fn_request_refund(text, text, text, text, text) to authenticated;


-- =====================================================================
-- 2) SQLSTATE 배정 — 신규 1개.
--    WC057  refund_request_parent_rejected  fn_request_refund(sql/88):
--                                            학부모 반려 이력이 있는 주문의
--                                            신규 환불 신청 거부(종결 축).
--    (WC001~WC056 배정 현황은 sql/71 7절·sql/85 5절 참고. 다음 신규 배정은
--     WC058부터.)
-- =====================================================================


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) 반려 이력 주문 재신청 → WC057.
--   -- approval_status='rejected' 인 refund_requests 가 있는 paid 주문에
--   -- 학생 JWT 로 fn_request_refund(...) 호출 → WC057 로 거부.
--   -- 같은 주문에 학부모 JWT 로 호출해도 동일하게 WC057.
--
-- V2) 반려 이력 없는 주문 → 기존 동작 회귀 없음.
--   -- 반려 이력 없는 paid 주문에 학생 신청 → 성공(requested), 그 상태로
--   -- 재신청 → WC007(기존 중복 가드 그대로).
--
-- V3) 게이트 순서 — WC006 이 WC057 보다 먼저다.
--   -- 미결제(pending) 주문에 반려 이력이 있어도(비정상 데이터) WC006 이
--   -- 먼저 난다 — "결제 확인된 주문만" 안내가 우선.
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- 2026-08-19 dev(gjowqdiopinhixfivnkx)·prod(ykrpjcsubmbenfcnwlzd) 적용
-- 완료(Management API database/query). 양쪽 모두 fn_request_refund
-- 오버로드 1개 확인. 클라이언트(결제 상세 모달 학생/학부모 환불 버튼
-- 숨김, WC057 문구)는 같은 작업의 별도 커밋.
-- =====================================================================
