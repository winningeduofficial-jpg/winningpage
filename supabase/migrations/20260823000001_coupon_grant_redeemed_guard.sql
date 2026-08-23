-- sql/90_coupon_grant_redeemed_guard.sql 복원 (2026-08-23).
-- sql/90은 qa 브랜치에서 2026-08-20 작성됐지만 dev DB에 적용되기 전에
-- sql/ 체계가 폐기·스쿼시(20260821000000_baseline)되면서 유실됐다 —
-- baseline의 fn_grant_coupon에는 redeemed 가드가 없다(실동작 QA에서 발견).
-- 내용은 원본 그대로, 적용 경로만 CI(db-push)로 바뀌었다.
--
-- (idempotent — 여러 번 실행해도 안전)
-- 전제: sql/55_coupon_policy.sql 이 먼저 적용돼 있어야 한다
--   (public.coupon_grants, public.fn_coupon_is_redeemed(uuid, uuid, timestamptz, text)
--   가 이미 존재해야 한다).
-- =====================================================================
--
-- 배경 (QA 리포트)
--   sql/55_coupon_policy.sql 의 fn_grant_coupon(발급형 쿠폰을 관리자가 한
--   사용자에게 부여하는 RPC)이 "이미 살아있는 발급이 있으면 멱등 반환"만
--   막고, "그 사용자가 이 쿠폰 정책을 이미 다 써버렸는가(coupons.
--   max_uses_per_user 소진)"는 전혀 보지 않는다. 그래서 관리자가 이미
--   사용 완료(redeemed)된 사용자에게 같은 쿠폰을 다시 발급하면:
--     · 발급 자체는 "성공"으로 보이는 새 coupon_grants 행이 생기지만
--     · 실제 결제 시점엔 fn_redeem_coupons 가 fn_coupon_is_redeemed 로
--       다시 걸러내 어차피 쓸 수 없다(sql/55 §4, 1629행 부근) — 즉 관리자
--       화면에만 "재발급 성공"이라는 거짓 신호가 남고, 사용자는 여전히
--       못 쓴다. 이 괴리를 발급 시점에 명확한 에러로 바꾼다.
--
-- 판정 재사용
--   이 파일은 새 판정 로직을 만들지 않는다 — sql/55 §2 가 이미 "이 쿠폰
--   정책을 사용자가 다 썼는가"를 판정하는 정본 헬퍼(fn_coupon_is_redeemed,
--   max_uses_per_user 카운트·voided_at 반영)를 SECURITY DEFINER 로 두고
--   있으므로 그대로 재사용한다(네 함수가 각자 판정하면 드리프트가 생긴다는
--   sql/55 의 기존 원칙을 그대로 따른다). fn_grant_coupon 도 SECURITY
--   DEFINER 라 정의자 권한으로 문제없이 호출된다(anon/authenticated 에는
--   fn_coupon_is_redeemed 실행 권한이 없어도 무관).
--
-- 가드 위치
--   "이미 살아있는 발급이 있으면 멱등 반환" 분기보다 먼저 검사한다 —
--   살아있는 발급이 있든 없든(과거에 회수됐다가 재발급 시도하는 경우 포함)
--   그 사용자가 이 쿠폰을 이미 다 썼다면 발급 자체를 막는 것이 이 QA
--   항목의 요구사항이다("사용 완료 쿠폰 재발급 차단").
--
-- errcode
--   WC005 : 이미 사용 완료(소진)된 쿠폰 정책 — 재발급 불가
--   (기존 WC001~WC004 는 sql/55 소유, 여기서 하나 더 늘린다)
--
-- 시그니처 불변 — CREATE OR REPLACE 로 충분
--   fn_grant_coupon(uuid, uuid) 인자·반환 타입 모두 그대로라
--   sql/55 §1-f) 가 겪었던 "오버로드 생성/REPLACE 거부" 문제가 없다.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.fn_coupon_is_redeemed(uuid, uuid, timestamptz, text)') is null then
    raise exception 'public.fn_coupon_is_redeemed 가 없다 — sql/55_coupon_policy.sql 을 먼저 실행하세요.';
  end if;
  if to_regclass('public.coupon_grants') is null then
    raise exception 'public.coupon_grants 가 없다 — sql/55_coupon_policy.sql 을 먼저 실행하세요.';
  end if;
end $$;

create or replace function public.fn_grant_coupon(
  p_coupon_id uuid,
  p_user_id   uuid
)
returns public.coupon_grants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant_type text;
  v_row        public.coupon_grants;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select c.grant_type into v_grant_type
    from public.coupons c
   where c.id = p_coupon_id;

  -- 없는 쿠폰도 "발급할 수 없는 쿠폰" 이다(coalesce 로 NULL 까지 함께 잡는다).
  -- 조건형 쿠폰에 발급 행을 만들면 판정에서 아무 효과가 없는 유령 행이 된다.
  if coalesce(v_grant_type, '') <> 'granted' then
    raise exception 'coupon_not_grantable' using errcode = 'WC004';
  end if;

  -- 사용 완료(redeemed) 가드 — 살아있는 발급 존재 여부와 무관하게 먼저
  -- 검사한다. 이 사용자가 이 쿠폰 정책을 이미 max_uses_per_user 만큼 다
  -- 썼다면(voided_at is null 인 정상 사용 기준), 새로 발급하든 과거 발급을
  -- 재확인하든 실사용은 어차피 fn_redeem_coupons 가 막으므로 발급 시점에
  -- 명확히 거부한다(위 배경 절 참고).
  if public.fn_coupon_is_redeemed(p_coupon_id, p_user_id) then
    raise exception 'coupon_already_redeemed' using errcode = 'WC005';
  end if;

  -- 멱등: 이미 살아있는 발급이 있으면 아무것도 하지 않고 그 행을 돌려준다
  -- (에러가 아니다 — 두 번 눌러도 같은 결과여야 한다).
  -- 부분 유니크 인덱스를 arbiter 로 쓰려면 술어를 그대로 다시 적어야 한다(42P10).
  insert into public.coupon_grants (coupon_id, user_id, granted_by)
  values (p_coupon_id, p_user_id, 'admin')
  on conflict (coupon_id, user_id) where revoked_at is null do nothing
  returning * into v_row;

  if v_row.id is null then
    select g.* into v_row
      from public.coupon_grants g
     where g.coupon_id = p_coupon_id
       and g.user_id = p_user_id
       and g.revoked_at is null;
  end if;

  return v_row;
end;
$$;

comment on function public.fn_grant_coupon(uuid, uuid) is
  '관리자 전용. 발급형 쿠폰을 한 사용자에게 발급한다(멱등 — 이미 살아있는 발급이 있으면 그 행을 그대로 반환). 이 사용자가 해당 쿠폰 정책을 이미 max_uses_per_user 만큼 사용 완료했으면 errcode=WC005(재발급 차단, 2026-08-20). 조건형이거나 없는 쿠폰이면 errcode=WC004. 관리자가 아니면 42501.';

-- 권한은 sql/55 §1-i) 와 동일 — CREATE OR REPLACE 는 기존 시그니처를 그대로
-- 덮어쓰므로(오버로드 생성 아님) 권한이 초기화되지 않지만, 명시적으로 다시
-- 선언해 이 파일 단독 재실행만으로도 최종 상태가 항상 같도록 고정한다.
revoke all on function public.fn_grant_coupon(uuid, uuid) from public, anon;
grant execute on function public.fn_grant_coupon(uuid, uuid) to authenticated, service_role;

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것)
-- =====================================================================
-- select proname, pg_get_function_identity_arguments(oid) as args, proacl
--   from pg_proc where proname = 'fn_grant_coupon';
--   → authenticated, service_role 에 EXECUTE 가 남아있어야 한다(재초기화 없음 확인).
--
-- 재발급 차단 시나리오 재현(예시, 실제 uuid 로 치환):
--   -- 1) 발급형 쿠폰을 사용자에게 발급 → 정상 주문으로 사용(paid) → 발급 회수(revoke)
--   -- 2) 같은 (coupon, user) 로 fn_grant_coupon 재호출
--   -- select public.fn_grant_coupon('<coupon-uuid>', '<user-uuid>');
--   --   → errcode WC005, message 'coupon_already_redeemed' 로 실패해야 한다.
-- =====================================================================
