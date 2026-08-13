-- =====================================================================
-- 74_refund_requester_parent_only.sql — 환불 신청 주체를 결제자로 한정
--
-- 결정 (2026-08-13 사용자 확정)
--   환불은 **결제한 사람만** 신청할 수 있다. 쌍 구조에서 결제자는 항상
--   학부모다(orders.user_id = parent_profile_id, 학생은 요청만 만들고
--   결제는 학부모가 한다 — sql/68).
--
--   그 전(sql/68~72)에는 학생도 신청할 수 있었고, 학생이 신청하면
--   approval_status='requested' 로 학부모 응답을 기다리는 2단계 구조였다.
--   그 단계는 기획에 없던 것이라 걷어낸다.
--
-- 무엇이 바뀌나
--   fn_request_refund 의 소유권 게이트만 좁힌다. 학생 호출은 WC044 로
--   거부한다(기존 WC005 "주문 없음/남의 주문"과 구분한다 — 학생은 그
--   주문의 당사자가 맞으므로 "없는 주문"이라고 하면 거짓말이 되고,
--   화면이 "결제하신 분만 신청할 수 있어요"로 안내할 근거도 사라진다).
--
-- 무엇을 그대로 두나 (의도적)
--   · approval_status 컬럼과 관련 CHECK 5종 — 그대로 둔다. 학부모 신청은
--     제약(refund_requests_parent_auto_approve_check)에 따라 항상
--     'approved' 로 들어가므로 이 축은 자동으로 만족된다. 컬럼을 지우려면
--     fn_respond_refund·fn_complete_refund(WC035)·부분 유니크 인덱스까지
--     연쇄로 손대야 하는데, 그건 이 결정이 요구하는 범위를 넘는다.
--   · fn_respond_refund — 호출자가 없어지지만 함수는 남긴다. 학생 신청을
--     다시 열 가능성이 있고, 남아 있어도 학부모 본인 신청은 이미 approved
--     라 WC028(이미 응답됨)로 막혀 오작동하지 않는다.
--   · 이미 만들어진 학생 신청 행 — 이 파일은 데이터를 건드리지 않는다.
--     남아 있다면 학부모가 응답하거나 어드민이 정리해야 한다.
--
-- 되돌리려면
--   아래 게이트를 sql/72 원문(학생 또는 학부모 허용)으로 되돌리면 된다.
--   다른 객체에는 의존하지 않는다.
--
-- SQLSTATE 배정
--   WC044  refund_requester_not_payer   결제자가 아닌 사람(학생)의 신청.
-- =====================================================================

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
  v_completed_amount  integer;
  v_quote             record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id, 100));

  select * into v_order from public.orders where id = p_order_id;

  -- 1) 당사자 판정 — 존재하지 않음과 남의 주문을 같은 코드로 묶는다
  --    (존재 여부 스캐닝 방지, sql/69 원칙 유지).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  -- 2) 신청 주체 판정(sql/74 신규) — 당사자이더라도 결제자가 아니면 거부.
  --    1)과 나누는 이유는 파일 상단 참고: 학생에게는 "당신 주문이 아니다"가
  --    아니라 "결제하신 분만 신청할 수 있다"고 말해야 한다.
  if v_caller is distinct from v_order.parent_profile_id then
    raise exception 'refund_requester_not_payer'
      using errcode = 'WC044',
            detail  = format('order_id=%s caller=%s payer=%s', p_order_id, v_caller, v_order.parent_profile_id);
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
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

  -- 신청자는 이제 항상 학부모(결제자)이므로 승인축은 즉시 approved 다.
  -- refund_requests_parent_auto_approve_check 가 요구하는 값이기도 하다.
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
    'approved', now(),
    v_quote.gross_amount, v_quote.policy_code, v_quote.needs_review, v_quote.lines
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_request_refund(text, text, text, text, text) is
  '환불 신청 생성(sql/74 재작성). 신청 주체를 **결제자(orders.parent_profile_id)** 로 한정한다 — 학생 호출은 WC044 로 거부(sql/72 까지는 학생도 신청할 수 있었고 학부모 승인 대기 단계가 있었다, 2026-08-13 정책 변경). 금액은 fn_refund_quote(제33조 산정)가 정하고 호출자 입력은 받지 않는다. approval_status 는 항상 approved 로 들어간다(신청자가 곧 결제자이므로). 나머지 가드(WC005/WC006/WC007/WC037)는 sql/72 와 동일.';

revoke all on function public.fn_request_refund(text, text, text, text, text) from public, anon;
grant execute on function public.fn_request_refund(text, text, text, text, text) to authenticated;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 학생 세션에서 자기 주문에 호출 → WC044 여야 한다(WC005 가 아니다):
--   select public.fn_request_refund('<order_id>', '테스트');
--
-- 학부모 세션에서 같은 호출 → 성공, approval_status='approved' 여야 한다:
--   select id, amount, gross_amount, status, approval_status
--     from public.refund_requests order by created_at desc limit 1;
--
-- 남아 있는 학생 신청(있다면) 확인:
--   select id, order_id, requested_by, student_profile_id, approval_status, status
--     from public.refund_requests where approval_status = 'requested';
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev 적용: (미적용 — 적용 후 이 줄에 날짜를 남길 것)
