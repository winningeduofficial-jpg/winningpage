-- 단체 쿠폰 — 소속 코드(org_code) 축 도입 (2026-08-27)
--
-- 왜
--   지금 쿠폰 판정 축은 두 개뿐이다 — "누구나"(auto) 아니면 "발급받은
--   사람만"(granted, coupon_grants). QA F4 는 세 번째 종류를 요구한다 —
--   **소속(단체) 코드로 가입한 학생·학부모만** 쓸 수 있는 쿠폰. 이건
--   "누가 발급받았는가"가 아니라 "그 사람이 어느 조직 소속인가"를 묻는
--   질문이라 발급(coupon_grants) 축과는 독립적이다 — 조건형(auto)에도
--   granted 에도 얹을 수 있어야 한다.
--
--   판정에 필요한 재료는 이미 있다 — profiles.org_code(20260825093735,
--   가입 시 upper(trim())으로 정규화해 저장)가 그것이다. 이 마이그레이션은
--   coupons 쪽에 짝이 되는 컬럼 하나(org_code)와, 그 둘을 비교하는 순수
--   함수 하나만 더한다.
--
-- 왜 새 판정 함수(fn_coupon_org_matches)를 따로 두나
--   fn_coupon_is_granted 처럼 기존 함수에 조건을 얹는 방식(20260825000010
--   방식)도 가능했지만, org 축은 "발급 여부"와 무관하게 auto/granted 쿠폰
--   양쪽에 동시에 걸려야 한다 — 즉 소진(is_redeemed)·재고(is_sold_out)
--   축과 나란히 서는 **네 번째 독립 축**이다. 기존 함수 시그니처(coupon_id,
--   user_id) 로는 "학생 또는 학부모 중 하나만 맞아도 통과"라는 쌍 OR
--   규칙을 표현할 수 없어(그 함수들은 단일 user_id 만 받는다) 학생·학부모
--   uuid 둘을 함께 받는 새 헬퍼가 필요했다.
--
-- 왜 security definer + upper(trim())
--   호출자(anon 포함, fn_usable_coupons 는 anon 도 실행 가능)가
--   profiles.org_code 를 직접 select 할 RLS 권한이 없어도 이 판정 하나는
--   가능해야 한다 — 이웃 헬퍼(fn_coupon_is_granted 등)와 동일한 이유로
--   security definer 를 쓴다. coupons.org_code 는 CHECK 제약으로 저장
--   시점에 이미 upper(trim())이 강제되므로 함수 안에서는 profiles.org_code
--   쪽만 대칭으로 정규화해 비교한다(가입 경로가 이미 upper(trim())해서
--   저장하지만, 다른 경로로 소문자가 들어올 가능성까지 막아 둔다).
--
-- 어디에 걸리나 (4곳)
--   · fn_usable_coupons / fn_coupon_by_code — 후보 목록·코드 조회 (org
--     불일치는 reason='org_mismatch')
--   · fn_respond_enrollment — 승인 확정 직전, p_coupon_ids 판정 루프에
--     자체 CASE(if/continue)가 있어 여기도 org 조건을 더한다(그렇지
--     않으면 프론트를 우회해 조작된 p_coupon_ids 로 org 제한을 뚫을 수
--     있다).
--   · fn_revalidate_order_coupons — 승인 직전 재검증. coupon_redemptions
--     에는 org 판정에 필요한 학생/학부모 uuid 가 없어(cr.user_id 는 귀속
--     소유자 하나뿐) orders 를 조인해 student_profile_id/parent_profile_id
--     를 가져온다.

-- ---------------------------------------------------------------------
-- 1) coupons.org_code 컬럼
-- ---------------------------------------------------------------------

alter table public.coupons
  add column if not exists org_code text;

alter table public.coupons
  drop constraint if exists coupons_org_code_normalized_check;

alter table public.coupons
  add constraint coupons_org_code_normalized_check
  check (org_code is null or org_code = upper(trim(org_code)));

comment on column public.coupons.org_code is
  '단체 쿠폰 축(2026-08-27). NULL 이면 소속 제한 없음(할인/선물 쿠폰). 값이 있으면 학생 또는 학부모의 profiles.org_code(20260825093735) 가 이 값과 같아야 사용 가능 — 판정은 fn_coupon_org_matches. 항상 upper(trim()) 정규화 상태로 저장(CHECK 로 강제).';

-- ---------------------------------------------------------------------
-- 2) 판정 헬퍼 — fn_coupon_org_matches
-- ---------------------------------------------------------------------

create or replace function public.fn_coupon_org_matches(
  p_coupon_org_code text,
  p_student uuid,
  p_parent uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_coupon_org_code is null
    or exists (
      select 1
      from public.profiles p
      where p.id in (p_student, p_parent)
        and p.org_code is not null
        and upper(trim(p.org_code)) = p_coupon_org_code
    );
$$;

comment on function public.fn_coupon_org_matches(text, uuid, uuid) is
  '단체 쿠폰 판정(2026-08-27). p_coupon_org_code 가 NULL 이면 항상 true(소속 제한 없음). 아니면 학생(p_student) 또는 학부모(p_parent) 중 하나라도 profiles.org_code 가 그 값과 같으면 true — 쌍 OR 규칙(granted 축과 동일한 원칙). coupons.org_code 는 저장 시점에 이미 upper(trim()) 이지만 이 함수는 profiles.org_code 쪽을 대칭으로 정규화해 비교한다.';

revoke all on function public.fn_coupon_org_matches(text, uuid, uuid) from public;
grant execute on function public.fn_coupon_org_matches(text, uuid, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) fn_usable_coupons / fn_coupon_by_code — org 축 추가
--
--    baseline(20260825000010 최신본) 원문에서 바뀐 곳은 세 군데뿐이다:
--      · org 래터럴 추가(fn_coupon_org_matches 한 번 계산, 재사용)
--      · eligible 에 `and org.matches` 추가
--      · reason CASE 에 'below_min_amount' 다음으로 'org_mismatch' 추가
-- ---------------------------------------------------------------------

create or replace function public.fn_usable_coupons(
  p_subtotal integer default 0,
  p_student_profile_id uuid default null
)
returns table(
  id uuid, title text, discount_amount integer, min_amount integer,
  valid_until date, is_active boolean, eligible boolean, reason text,
  owner_profile_id uuid, owner_is_student boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  -- 쌍이 없으면(학부모 미연결, 또는 v_student 자체가 NULL 인 비로그인) 후보
  -- 없음 — 결제 자체가 불가능하므로 쿠폰도 없다.
  if v_student is null or v_parent is null then
    return;
  end if;

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  -- LATERAL 로 학생·학부모 판정을 행당 한 번씩만 계산한다(sql/55 3)절과
  -- 같은 원칙 — eligible/reason/owner 세 컬럼에서 재사용).
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      -- 5-d절과 동일 규칙 — 학생 소유·미소진 우선, 아니면 학부모, 둘 다
      -- 아니면 NULL(granted 인데 소유자가 없거나 이미 다 소진). auto 는
      -- 항상 NULL.
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      -- 쿠폰 기한과 발급분 기한 중 이른 날. greatest 로 쌍의 두 발급분 중
      -- 늦은 쪽을 고르는 이유는 "이 쌍이 이 쿠폰을 쓸 수 있는 마지막 날"이
      -- 표시 의미이기 때문이다(둘 중 하나만 살아 있어도 결제가 된다).
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_coupon_org_matches(c.org_code, v_student, v_parent) as matches
  ) as org
  where c.is_active = true
  order by c.discount_amount desc, c.slug;
end;
$$;

comment on function public.fn_usable_coupons(integer, uuid) is
  '쿠폰 판정 정본(활성 쿠폰만, sql/68 5-h절 쌍 축 재작성). p_student_profile_id 가 NULL 이면 호출자를 학생으로 보고 approved 학부모를 도출한다 — 값이 있으면 호출자가 그 학생 본인/학부모인지 검증한다(WC030). 쌍(학생+학부모)이 없으면 빈 목록. eligible/reason 은 5-d절 fn_respond_enrollment 와 동일 규칙(granted=쌍 OR+학생 우선, auto=소유 판정 없음). 반환 valid_until 은 쿠폰 기한과 발급분 기한(coupon_grants.valid_until) 중 이른 날이다(20260825000010) — 발급일 기준 기한이 붙은 쿠폰이 "무기한"으로 표시되지 않게 한다. owner_profile_id/owner_is_student 로 "누구 보유분"인지 알려준다(auto 는 owner_profile_id NULL). 단체 쿠폰(coupons.org_code)은 학생 또는 학부모의 profiles.org_code 가 일치해야 하고, 불일치면 reason=''org_mismatch''(20260831020402). 한국어 라벨은 만들지 않는다 — 표기는 프론트 책임.';

create or replace function public.fn_coupon_by_code(
  p_code text,
  p_subtotal integer default 0,
  p_student_profile_id uuid default null
)
returns table(
  id uuid, title text, discount_amount integer, min_amount integer,
  valid_until date, is_active boolean, eligible boolean, reason text,
  owner_profile_id uuid, owner_is_student boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_code    text := lower(trim(coalesce(p_code, '')));
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  if v_code = '' then
    return;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  if v_student is null or v_parent is null then
    return;
  end if;

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_coupon_org_matches(c.org_code, v_student, v_parent) as matches
  ) as org
  where c.code is not null
    and lower(c.code) = v_code
  limit 1;
end;
$$;

comment on function public.fn_coupon_by_code(text, integer, uuid) is
  '코드 직접 입력 조회 전용(sql/68 5-h절 쌍 축 재작성). code 를 입력으로만 받고 반환하지 않는다(sql/55 P1-1 유지). 학생/학부모 판정 축과 owner_profile_id/owner_is_student 는 fn_usable_coupons 와 동일 규칙(WC030 포함). 반환 valid_until 도 동일하게 쿠폰 기한과 발급분 기한 중 이른 날이다(20260825000010). 단체 쿠폰 불일치는 reason=''org_mismatch''(20260831020402). 못 찾으면 0행.';

revoke all on function public.fn_usable_coupons(integer, uuid) from public;
grant execute on function public.fn_usable_coupons(integer, uuid)
  to anon, authenticated, service_role;
revoke all on function public.fn_coupon_by_code(text, integer, uuid) from public;
grant execute on function public.fn_coupon_by_code(text, integer, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) fn_respond_enrollment — 승인 확정 판정 루프에 org 조건 추가
--
--    baseline 원문에서 바뀐 곳은 두 군데뿐이다:
--      · v_coupon 커서 select 목록에 c.org_code 추가
--      · min_amount continue 분기 다음에 org 불일치 continue 분기 추가
--    (fn_usable_coupons 처럼 별도 reason 문자열을 반환하지 않는다 — 이
--    함수는 원래도 최종 skipped_coupon_ids 만 보고하고 개별 탈락 사유를
--    분류하지 않는다, 원문 그대로 유지)
-- ---------------------------------------------------------------------

create or replace function public.fn_respond_enrollment(
  p_order_id text,
  p_approve boolean,
  p_reject_reason text default null::text,
  p_coupon_ids uuid[] default null::uuid[]
)
returns table(order_id text, status text, approval_status text, amount integer, discount_amount integer, applied_coupon_ids uuid[], skipped_coupon_ids uuid[])
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
               c.max_uses_per_user, c.max_redemptions, c.stackable, c.grant_type, c.org_code
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
        -- 신규(20260831020402) — 단체 쿠폰. 학생·학부모 둘 다 소속 코드가
        -- 다르거나 없으면 이 쿠폰은 후보에서 제외한다. 프론트가 이미
        -- fn_usable_coupons/fn_coupon_by_code 로 걸러 보여주지만, 여기서도
        -- 막아야 조작된 p_coupon_ids 로 org 제한을 우회할 수 없다.
        if not public.fn_coupon_org_matches(
             v_coupon.org_code, v_order.student_profile_id, v_order.parent_profile_id) then
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
  '학부모가 학생의 수강신청(주문)을 수락/반려한다(sql/71 재작성 — RETURNS 를 orders 레코드에서 TABLE(단일 행: order_id/status/approval_status/amount/discount_amount/applied_coupon_ids/skipped_coupon_ids)로 변경, 2026-08-12). 응답 게이트는 WC021(주문 없음)·WC022(학부모 아님)에 신규 WC040(orders.status<>pending — 이 함수를 거치지 않은 경로로 이미 종결된 요청 재응답 차단)을 더했다. 승인(p_approve=true)은 approval_status=requested 인 건만 받는다(WC023). 반려(p_approve=false)는 requested 뿐 아니라 approved 인 건도 받는다(sql/86, WC023 재사용 — rejected/superseded 등 이미 종결된 건은 여전히 거부) — 학부모가 수락 후 아직 결제 전(status=pending)에 마음을 바꿔 반려할 수 있게 한다. 승인 시 쿠폰을 여기서 직접 확정한다(쌍 OR 자격·advisory lock·stacking·재검증 WC031, sql/69 1-f절과 동일). 단체 쿠폰(coupons.org_code)은 학생·학부모 둘 다 소속 코드가 불일치하면 후보에서 제외한다(20260831020402, 조작된 p_coupon_ids 우회 차단). p_coupon_ids 중 최종 미적용 id 는 skipped_coupon_ids 로 보고한다(차집합 계산, 사유 미분류). 30분 lazy 정리로 다른 pending 주문의 coupon_redemptions 가 void 될 때 그 주문의 discount_amount/amount 도 함께 원복한다(sql/71). 반려 시 사유 필수(WC025)이며 orders.status 를 canceled 로 내린다. approved 건 반려 시 그 주문의 살아있는 coupon_redemptions 를 전부 void(void_reason=enrollment_rejected)하고 void 한 할인 합만큼 discount_amount/amount 를 원복하며 coupon_id 를 NULL 로 되돌린다(sql/86, requested 건은 void 대상 0행이라 자연히 no-op).';

revoke all on function public.fn_respond_enrollment(text, boolean, text, uuid[]) from public;
grant execute on function public.fn_respond_enrollment(text, boolean, text, uuid[])
  to authenticated;

-- ---------------------------------------------------------------------
-- 5) fn_revalidate_order_coupons — 승인 직전 재검증에 org 축 추가
--
--    baseline 원문에서 바뀐 곳: coupon_redemptions 에는 학생/학부모
--    uuid 가 없어(cr.user_id 는 귀속 소유자 하나, auto 는 NULL) orders
--    를 조인해 student_profile_id/parent_profile_id 를 가져온 뒤
--    org_ok 를 계산하고, ok 표현식과 reason CASE 에 반영한다.
-- ---------------------------------------------------------------------

create or replace function public.fn_revalidate_order_coupons(p_order_id text)
returns table(coupon_id uuid, ok boolean, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  return query
  select
    cr.coupon_id,
    (chk.is_granted and not chk.is_redeemed and not chk.is_sold_out and chk.is_org_ok) as ok,
    case
      when not chk.is_granted then 'not_granted'
      when chk.is_redeemed then 'already_used'
      when chk.is_sold_out then 'sold_out'
      when not chk.is_org_ok then 'org_mismatch'
      else null
    end as reason
  from public.coupon_redemptions cr
  join public.orders o on o.id = cr.order_id
  join public.coupons c on c.id = cr.coupon_id
  cross join lateral (
    select
      (cr.user_id is null or public.fn_coupon_is_granted(cr.coupon_id, cr.user_id)) as is_granted,
      (cr.user_id is not null
        and public.fn_coupon_is_redeemed(cr.coupon_id, cr.user_id, v_now, p_order_id)) as is_redeemed,
      public.fn_coupon_global_redeemed(cr.coupon_id, v_now, p_order_id) as is_sold_out,
      public.fn_coupon_org_matches(c.org_code, o.student_profile_id, o.parent_profile_id) as is_org_ok
  ) as chk
  where cr.order_id = p_order_id
    and cr.voided_at is null;
end;
$$;

comment on function public.fn_revalidate_order_coupons(text) is
  'service_role 전용. 결제 승인 직전 호출 — coupon_redemptions 행마다 그 행의 귀속 소유자(cr.user_id)를 축으로 재판정한다(sql/68 5-i절 재작성, orders.user_id 단일 축 폐기). cr.user_id NULL(auto)은 소유 판정 없이 항상 발급·미소진 취급. 판정 축 4개: 발급(not_granted)/1인 사용 횟수(already_used)/전체 발행량(sold_out)/단체 소속 일치(org_mismatch, 20260831020402 — orders 의 student_profile_id/parent_profile_id 로 판정, 승인 대기 중 소속이 바뀌거나 org 제한이 걸린 경우를 잡는다). 행이 없으면 이 주문에 쿠폰이 없다는 뜻(통과). ok=false 행이 있으면 승인을 진행하지 않아야 한다.';

revoke all on function public.fn_revalidate_order_coupons(text) from public;
grant execute on function public.fn_revalidate_order_coupons(text) to service_role;
