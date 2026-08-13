-- =====================================================================
-- 75_refund_student_request_restore.sql — sql/74 철회
--
-- 무슨 일이 있었나
--   2026-08-13, 학생 환불 신청 플로우가 기획에 없다고 판단해 sql/74 가
--   신청 주체를 결제자(학부모)로 한정했다(WC044). 그런데 확정 디자인에
--   학생 → 학부모 환불 요청 화면이 **있다**:
--     · 3967:3561  "환불을 요청할게요" — 학생 요청 모달.
--       안내 문구가 "결제는 OOO 학부모님이 하셨어요. 환불 요청을 보내면
--       학부모님이 확인 후 환불을 진행합니다."
--     · 3967:3933  "환불 요청을 보냈어요" — 요청 완료 모달.
--     · 3967:3944  학부모 결제 내역 탭의 "환불요청" 섹션(= 학부모가 자녀
--       요청을 확인하는 자리)과 탭 배지 "환불 요청 1".
--
--   즉 sql/68 이 만들어 둔 2단계 승인축(학생 신청 → 학부모 확인)이 원래
--   설계가 맞았다. sql/74 는 판단 착오였으므로 되돌린다.
--
-- 이 파일이 하는 일
--   fn_request_refund 를 sql/72 판본으로 되돌린다 — 신청 주체는 그 주문의
--   학생 또는 학부모 둘 다이고, 승인축은 신청자에 따라 갈린다:
--     학생 신청  → approval_status='requested' (학부모 확인 대기)
--     학부모 신청 → approval_status='approved'  (본인이 결제자이므로 즉시)
--   WC044 는 더 이상 발생하지 않는다(코드 자체를 쓰지 않는다 — 재사용하지
--   말 것, 로그·이슈에서 이 사건을 가리키는 표식으로 남긴다).
--
-- 그대로 두는 것
--   sql/72 의 제33조 산정(fn_refund_quote)과 기록 컬럼(gross_amount/
--   policy_code/needs_review/quote)은 sql/74 와 무관하므로 손대지 않는다.
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
  '환불 신청 생성(sql/75 — sql/74 철회, sql/72 판본 복귀). 그 주문의 학생 또는 학부모가 신청할 수 있고, 학생 신청은 approval_status=requested(학부모 확인 대기), 학부모 신청은 approved 로 들어간다. 확정 디자인(3967:3561 학생 요청 모달 / 3967:3944 학부모 환불요청 섹션)이 이 2단계를 요구한다. 금액은 fn_refund_quote(제33조)가 정한다. 가드는 WC005/WC006/WC007/WC037.';

revoke all on function public.fn_request_refund(text, text, text, text, text) from public, anon;
grant execute on function public.fn_request_refund(text, text, text, text, text) to authenticated;


-- =====================================================================
-- 확인용
-- =====================================================================
-- 학생 세션에서 자기 주문에 호출 → 더 이상 WC044 가 아니어야 한다
-- (미종결 신청이 없다면 성공, 있다면 WC007):
--   select public.fn_request_refund('<order_id>', '테스트');
--
-- 학생 신청 후 승인축 확인:
--   select id, requested_by, approval_status, status from public.refund_requests
--    order by created_at desc limit 1;   -- approval_status = 'requested'
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev 적용: (미적용 — 적용 후 이 줄에 날짜를 남길 것)
