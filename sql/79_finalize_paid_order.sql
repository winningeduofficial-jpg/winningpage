-- =====================================================================
-- 결제확정(orders UPDATE) + 이용권 부여(fn_grant_program_access_for_order)를
-- 한 트랜잭션으로 묶는다.
--
-- 배경: api/confirm-payment.js·api/toss-webhook.js 둘 다 지금까지 "orders 를
-- paid 로 확정하는 UPDATE"와 "권한을 부여하는 RPC 호출"을 별개 네트워크
-- 왕복으로 실행했다. 그 사이(승인은 났는데 아직 부여를 안 부른 순간) 함수가
-- 죽으면 결제는 됐는데 권한만 없는 주문이 남는다. 복구 수단(성공 페이지
-- 재방문 멱등 재시도·토스 웹훅 재전송)이 있어 방치돼도 회복은 되지만, 그
-- 창(window) 자체를 없애는 편이 낫다 — 원인은 하나(단일 RPC), 결과는 항상
-- 같은 트랜잭션 안에서 확정된다.
--
-- 부여 실패가 결제 승인을 되돌리면 안 된다는 기존 계약(api/_lib/programAccess.js
-- 상단 주석 "절대 throw 하지 않는다")은 유지한다 — 아래 grant 호출을 중첩
-- BEGIN/EXCEPTION(암묵적 SAVEPOINT)으로 감싸, 부여가 예외를 던져도 이미 실행된
-- orders UPDATE 는 롤백되지 않고 그대로 커밋된다.
--
-- 두 호출부의 UPDATE 조건이 다르다:
--   confirm-payment.js  — amount 일치 + status IN (pending,failed) 조건부(레이스 가드)
--   toss-webhook.js     — 무조건(웹훅은 이미 JS 단에서 refunded/미승인/unchanged 를
--                          앞서 걸러냈고, 원래도 상태 조건 없이 blind update 였다)
-- p_confirm_amount·p_require_pending_or_failed 로 이 차이를 파라미터화한다 —
-- 새 RPC를 두 벌 만들지 않는다.
-- =====================================================================

create or replace function public.fn_finalize_paid_order(
  p_order_id                  text,
  p_status                    text,      -- 'paid' | 'waiting_deposit' 만 허용
  p_payment_key                text,      -- null 이면 기존 값 유지(coalesce) — 웹훅은 이 컬럼을 안 건드렸다
  p_method                     text,
  p_paid_at                    timestamptz,
  p_raw                        jsonb,
  p_confirm_amount             numeric  default null,   -- null = 금액 재검증 생략(웹훅)
  p_require_pending_or_failed  boolean  default true,    -- false = 상태 무조건 갱신(웹훅)
  p_restore_revoked            boolean  default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order  public.orders;
  v_access jsonb;
begin
  if p_status not in ('paid', 'waiting_deposit') then
    raise exception 'invalid_status' using errcode = 'WC050';
  end if;

  update public.orders
     set status       = p_status,
         payment_key  = coalesce(p_payment_key, payment_key),
         method       = p_method,
         paid_at      = p_paid_at,
         raw          = p_raw
   where id = p_order_id
     and (p_confirm_amount is null or amount = p_confirm_amount)
     and (not p_require_pending_or_failed or status in ('pending', 'failed'))
  returning * into v_order;

  if not found then
    -- 호출부가 기존과 동일하게 처리한다(승인 성공·기록 실패 → 500 + 로그).
    return jsonb_build_object('ok', false, 'error', 'order_update_failed');
  end if;

  -- 가상계좌는 아직 입금 전이므로 부여하지 않는다(기존 규칙 그대로).
  if p_status = 'waiting_deposit' then
    return jsonb_build_object(
      'ok', true,
      'access', jsonb_build_object(
        'ok', false, 'error', 'waiting_deposit',
        'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
        'skipped', '[]'::jsonb, 'ledger_inserted', 0
      )
    );
  end if;

  -- 부여 대상은 학생이다 — fn_grant_program_access_for_order 내부가
  -- v_order.parent_profile_id 로 p_user_id(=orders.user_id, 결제자) 를 검증하고
  -- program_access_grants 는 v_order.student_profile_id 에 쓴다(sql/69).
  begin
    v_access := public.fn_grant_program_access_for_order(
      p_order_id, v_order.user_id, p_paid_at, p_restore_revoked
    );
  exception when others then
    -- 여기서 SAVEPOINT 롤백되는 건 grant 호출 내부의 변경분뿐이다 — 위 orders
    -- UPDATE 는 이 블록 밖에서 이미 실행돼 트랜잭션에 그대로 남는다.
    v_access := jsonb_build_object(
      'ok', false, 'error', sqlerrm,
      'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
      'skipped', '[]'::jsonb, 'ledger_inserted', 0
    );
  end;

  return jsonb_build_object('ok', true, 'access', v_access);
end;
$function$;

revoke all on function public.fn_finalize_paid_order(
  text, text, text, text, timestamptz, jsonb, numeric, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.fn_finalize_paid_order(
  text, text, text, text, timestamptz, jsonb, numeric, boolean, boolean
) to service_role;
