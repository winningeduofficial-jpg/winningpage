-- =====================================================================
-- 76_enrollment_allow_multiple_open.sql — 열린 결제요청 중복 차단(WC043) 철회
--
-- 결정 (2026-08-13 사용자 확정)
--   한 학생이 승인 대기 중인 결제요청을 여러 건 가질 수 있게 한다.
--
-- 왜 되돌리나
--   WC043 은 sql/71(2026-08-12)이 동시성 락(salt 101)을 넣으면서 함께 들어온
--   가드다. 그런데 그 파일 어디에도 이 규칙의 출처 표기가 없다 — 같은 파일의
--   다른 결정에는 "팀 리드가 지시한" 같은 근거가 붙어 있는데 WC043 에만 없고,
--   주석의 근거는 "한 학생은 항상 최대 하나의 승인 대기 요청만 가져야 한다"는
--   전제를 그대로 반복한 것뿐이다. 기획 확인 결과 그런 규칙은 없었다.
--
--   실제 피해가 확인됐다 — 학생이 목표관리를 신청한 뒤 학부모가 응답을 미루면
--   그 학생은 콜멘토도 수행평가도 신청할 수 없다. 학부모가 결제하지 않는 한
--   풀 방법이 없고(거절 UI 도 아직 없다), 확정 디자인이 학생 "신청 내역"과
--   학부모 "결제 신청하기"를 **여러 행 표**로 그린 것과도 어긋난다
--   (3967:3016 / 3967:3944 — 열린 요청이 항상 1건이면 표로 그릴 이유가 없다).
--
-- 동시성은 그대로 유지된다
--   이중 클릭·경합 방지는 WC043 이 아니라 학생 축 advisory lock(salt 101)이
--   한다. 그 락은 건드리지 않는다 — 이 파일은 EXISTS 검사 한 블록만 뺀다.
--   따라서 "같은 요청이 두 번 만들어지는" 사고는 계속 막힌다. 막지 않게 되는
--   것은 "사용자가 의도적으로 서로 다른 요청을 여러 건 올리는" 경우뿐이고,
--   그건 결제 전 단계라 실질 피해가 없다(학부모가 누르지 않으면 돈이 나가지
--   않는다).
--
-- WC043 은 재사용하지 않는다 — 로그·이슈에서 이 사건을 가리키는 표식으로
-- 남긴다(sql/74 의 WC044 와 같은 처리).
-- =====================================================================

create or replace function public.fn_request_enrollment(
  p_order_id           text,
  p_student_profile_id uuid,
  p_parent_profile_id  uuid,
  p_customer_email     text,
  p_order_name         text,
  p_items              jsonb,
  p_list_amount        integer,
  p_subtotal           integer
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
  '학생이 수강신청(주문)을 생성한다(sql/76 — WC043 중복 열린 요청 차단 제거, 2026-08-13 사용자 확정). 한 학생이 승인 대기 요청을 여러 건 가질 수 있다. 동시 이중 신청 방지는 학생 축 advisory lock(salt 101)이 계속 담당한다. 나머지 가드(쌍 필수 WC019·동일인 금지 WC020·링크 검증 WC042·0원 이하 WC001)는 sql/71 원문과 동일하다. auth.uid() 는 참조하지 않는다 — 신뢰 경계는 호출자(api/request-enrollment.js)다.';

revoke all on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer)
  to service_role;


-- =====================================================================
-- 확인용
-- =====================================================================
-- 같은 학생으로 서로 다른 상품을 연달아 신청 → 둘 다 성공해야 한다(WC043 없음):
--   select * from public.orders
--    where student_profile_id = '<학생>' and status='pending' and approval_status='requested';
--
-- 학생 마이페이지 "신청 내역"과 학부모 "결제 신청하기" 섹션에 여러 행이 뜬다.
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev 적용: (미적용 — 적용 후 이 줄에 날짜를 남길 것)
