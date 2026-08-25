-- 발급형 쿠폰의 "발급일로부터 N개월" 유효기간 (2026-08-25)
--
-- 왜
--   가입 축하 알림톡(승인 문안, api/_lib/alimtalkTemplates.ts signupCoupon)이
--   **"쿠폰은 발급일로부터 6개월간 사용 가능하며"** 라고 약속한다. 그런데 지금
--   기한 축은 coupons.valid_until 하나뿐이고 그건 **쿠폰 전체의 고정 날짜**다
--   (signup-2000 은 2026-09-30 이었다). 즉
--     · 8월 가입자는 5주짜리 쿠폰을 받으면서 "6개월" 문자를 받고
--     · 그 날짜가 지나면 fn_grant_signup_coupons 의 valid_until 조건 때문에
--       **발급 자체가 건너뛰어져** 문자만 가고 쿠폰은 없는 상태가 된다.
--   기한을 쿠폰이 아니라 **발급분(coupon_grants)** 에 둬야 문구가 사실이 된다.
--
-- 판정 축을 늘리지 않는다
--   새 판정 함수를 만들지 않고 기존 정본 fn_coupon_is_granted 에 조건 하나를
--   더한다. 이 함수 하나가 결제 확정(fn_respond_enrollment)·승인 직전 재검증
--   (fn_revalidate_order_coupons)·후보 목록(fn_usable_coupons)·코드 조회
--   (fn_coupon_by_code) 네 경로의 발급 판정을 전부 대신하고 있어서, 여기만
--   고치면 만료가 모든 경로에 동시에 걸린다.
--
-- 왜 date 인가
--   coupons.valid_until 이 이미 date 이고 비교도 (now() at time zone 'Asia/Seoul')
--   ::date 로 한다. 발급분 기한을 timestamptz 로 두면 "목록엔 쓸 수 있다고
--   뜨는데 결제에서 막히는" 반나절짜리 창이 생긴다(날짜 축 판정 vs 시각 축
--   판정). 같은 타입·같은 시간대 규약으로 맞춘다.
--
-- N=6 의 자리
--   fn_coupon_grant_valid_months() 상수 함수 하나에 둔다 — 이 저장소가 이미
--   쓰는 정책 리터럴 보관 방식이다(fn_coupon_pending_hold_minutes). 발급형
--   쿠폰이 지금 하나뿐이라 쿠폰별 컬럼은 두지 않는다. 쿠폰마다 창을 달리
--   해야 하는 날 coupons.grant_valid_months 를 더하고 이 함수를 기본값으로
--   내리면 된다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 발급분 기한 컬럼
-- ---------------------------------------------------------------------

alter table public.coupon_grants
  add column if not exists valid_until date;

comment on column public.coupon_grants.valid_until is
  '이 발급분의 사용 기한(포함, Asia/Seoul 날짜). NULL = 무기한. 쿠폰 전체 기한인 coupons.valid_until 과 별개 축이며, 실제 사용 가능 여부는 둘 중 이른 날짜가 정한다. fn_coupon_is_granted 가 이 값을 본다(20260825000001).';

-- ---------------------------------------------------------------------
-- 2) 정책 리터럴 — 발급일로부터 몇 개월인가
-- ---------------------------------------------------------------------

create or replace function public.fn_coupon_grant_valid_months()
returns integer
language sql
immutable
as $$ select 6 $$;

comment on function public.fn_coupon_grant_valid_months() is
  '발급형 쿠폰 발급분의 유효 개월 수(6). 가입 축하 알림톡 승인 문안의 "발급일로부터 6개월간 사용 가능" 이 근거다 — 문안을 바꾸려면 알리고 재심사가 필요하므로 이 값만 임의로 고치지 말 것. fn_coupon_pending_hold_minutes 와 같은 "정책 리터럴 단일 정본" 방식이다.';

-- ---------------------------------------------------------------------
-- 3) 발급 판정 정본에 기한을 더한다
--
--    baseline(20260821000000) 원문에 `and (g.valid_until is null or
--    g.valid_until >= 오늘)` 한 줄만 추가한 것이다. 나머지는 그대로다.
-- ---------------------------------------------------------------------

create or replace function public.fn_coupon_is_granted(
  p_coupon_id uuid,
  p_user_id   uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      with c as (
        select grant_type
        from public.coupons
        where id = p_coupon_id
      )
      select
        c.grant_type <> 'granted'
        or exists (
          select 1
          from public.coupon_grants g
          where g.coupon_id = p_coupon_id
            and p_user_id is not null
            and g.user_id = p_user_id
            and g.revoked_at is null
            -- 발급분 기한(20260825000001). NULL 이면 무기한 — 이 컬럼이
            -- 생기기 전 발급분과 관리자 수기 발급이 여기 해당한다.
            and (g.valid_until is null
                 or g.valid_until >= (now() at time zone 'Asia/Seoul')::date)
        )
      from c
    ),
    false
  );
$$;

comment on function public.fn_coupon_is_granted(uuid, uuid) is
  '발급 판정 정본. 조건형(grant_type=auto)은 항상 true. 발급형은 coupon_grants 에 회수되지 않고 **기한이 지나지 않은** 발급 행이 있어야 true(coupon_grants.valid_until, 20260825000001). 게스트(user_id NULL)는 발급형에서 항상 false. 없는 쿠폰은 false(fail-closed).';

-- ---------------------------------------------------------------------
-- 4) 표시용 기한 — 이 쌍이 이 쿠폰을 쓸 수 있는 마지막 날
--
--    체크아웃 목록은 coupons.valid_until 을 그대로 보여준다. 발급분 기한이
--    생겼으므로 그것까지 반영하지 않으면 "무기한"이라 써 놓고 6개월 뒤
--    조용히 사라지는 쿠폰이 된다.
-- ---------------------------------------------------------------------

create or replace function public.fn_coupon_grant_valid_until(
  p_coupon_id uuid,
  p_user_id   uuid
)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 살아있는 발급은 (coupon_id, user_id)당 1건이다(coupon_grants_live_uidx).
  -- 기한이 지난 행도 그대로 돌려준다 — 호출부가 'expired' 사유를 그릴 수
  -- 있어야 하기 때문이다(만료를 '미보유'로 뭉뚱그리지 않는다).
  select g.valid_until
    from public.coupon_grants g
   where g.coupon_id = p_coupon_id
     and p_user_id is not null
     and g.user_id = p_user_id
     and g.revoked_at is null
   order by g.valid_until desc nulls first
   limit 1;
$$;

comment on function public.fn_coupon_grant_valid_until(uuid, uuid) is
  '표시 전용(20260825000001). 그 사용자의 살아있는 발급분 기한(coupon_grants.valid_until)을 돌려준다. NULL = 무기한이거나 발급분 없음. 만료된 발급분도 그대로 돌려준다 — fn_usable_coupons 가 사유를 expired 로 그리기 위해서다. 사용 가능 여부 판정에는 쓰지 말 것(정본은 fn_coupon_is_granted).';

revoke all on function public.fn_coupon_grant_valid_until(uuid, uuid) from public, anon;
grant execute on function public.fn_coupon_grant_valid_until(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) 가입 쿠폰 발급 — 트리거 본문을 호출 가능한 함수로 꺼낸다
--
--    ⚠️ auth.users 트리거는 dev·로컬 전용이고 prod 에는 없다(supabase/README
--    "의도적 드리프트", 사용자 확정 2026-08-21). 그래서 prod 에서는 아무도
--    가입 쿠폰을 발급하지 않는다 — 알림톡만 나가고 쿠폰은 없는 상태가 된다.
--    발급 본문을 service_role 이 부를 수 있는 함수로 꺼내 두면 서버
--    (api/signup-welcome.ts)가 알림톡 직전에 직접 발급할 수 있고, 트리거가
--    있는 dev 에서는 멱등이라 두 번 발급되지 않는다.
-- ---------------------------------------------------------------------

create or replace function public.fn_grant_signup_coupons_for_user(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_granted integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  insert into public.coupon_grants (coupon_id, user_id, granted_by, valid_until)
  select
    c.id,
    p_user_id,
    'signup',
    (v_today + (public.fn_coupon_grant_valid_months() || ' months')::interval)::date
    from public.coupons c
   where c.grant_type = 'granted'
     and c.grant_on_signup = true
     and c.is_active = true
     and (c.valid_until is null or c.valid_until >= v_today)
  on conflict (coupon_id, user_id) where revoked_at is null do nothing;

  get diagnostics v_granted = row_count;

  return v_granted;
end;
$$;

comment on function public.fn_grant_signup_coupons_for_user(uuid) is
  '가입 쿠폰 발급 본문(20260825000001). coupons.grant_on_signup 인 발급형 쿠폰을 한 사용자에게 발급하고 발급 건수를 돌려준다. 멱등 — 살아있는 발급이 이미 있으면 0건. 발급분 기한은 오늘(KST) + fn_coupon_grant_valid_months() 개월. 호출자는 둘이다: dev·로컬의 auth.users 트리거(fn_grant_signup_coupons)와 prod 를 포함한 서버(api/signup-welcome.ts, service_role) — prod 에는 트리거가 없어서 서버 호출이 유일한 발급 경로다.';

revoke all on function public.fn_grant_signup_coupons_for_user(uuid) from public, anon, authenticated;
grant execute on function public.fn_grant_signup_coupons_for_user(uuid) to service_role;

-- 트리거 함수는 이제 위 본문을 부르기만 한다. 실패해도 가입을 막지 않는
-- 예외 처리는 그대로 유지한다(baseline 원문 절).
create or replace function public.fn_grant_signup_coupons()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.fn_grant_signup_coupons_for_user(new.id);
  exception
    when others then
      -- 쿠폰 발급 실패가 회원가입을 실패시켜서는 안 된다(baseline 원문 절).
      raise warning 'fn_grant_signup_coupons failed for user %: % (%)',
        new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

comment on function public.fn_grant_signup_coupons() is
  'auth.users AFTER INSERT 트리거(dev·로컬 전용 — prod 에는 이 트리거를 만들지 않는다, supabase/README). 본문은 fn_grant_signup_coupons_for_user 로 옮겼고 여기서는 그것을 감싸 예외를 삼킨다 — 어떤 실패도 가입을 막지 않는다(warning 만 남는다).';

-- ---------------------------------------------------------------------
-- 6) 관리자 직접 발급도 같은 기한을 붙인다
--
--    20260823000001(WC005 가드) 원문에 valid_until 컬럼만 추가한 것이다.
--    관리자 발급만 무기한으로 남기면 같은 쿠폰인데 발급 경로에 따라 기한이
--    갈린다 — 회수·재발급을 거치면 그 차이가 그대로 굳는다.
-- ---------------------------------------------------------------------

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

  if coalesce(v_grant_type, '') <> 'granted' then
    raise exception 'coupon_not_grantable' using errcode = 'WC004';
  end if;

  -- 사용 완료(redeemed) 가드 — 20260823000001 원문 그대로.
  if public.fn_coupon_is_redeemed(p_coupon_id, p_user_id) then
    raise exception 'coupon_already_redeemed' using errcode = 'WC005';
  end if;

  insert into public.coupon_grants (coupon_id, user_id, granted_by, valid_until)
  values (
    p_coupon_id,
    p_user_id,
    'admin',
    ((now() at time zone 'Asia/Seoul')::date
       + (public.fn_coupon_grant_valid_months() || ' months')::interval)::date
  )
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
  '관리자 전용. 발급형 쿠폰을 한 사용자에게 발급한다(멱등 — 이미 살아있는 발급이 있으면 그 행을 그대로 반환). 발급분 기한은 오늘(KST) + fn_coupon_grant_valid_months() 개월(20260825000001). 이 사용자가 해당 쿠폰 정책을 이미 max_uses_per_user 만큼 사용 완료했으면 errcode=WC005(재발급 차단, 2026-08-20). 조건형이거나 없는 쿠폰이면 errcode=WC004. 관리자가 아니면 42501.';

revoke all on function public.fn_grant_coupon(uuid, uuid) from public, anon;
grant execute on function public.fn_grant_coupon(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) 후보 목록·코드 조회가 실제 기한을 보여주게 한다
--
--    baseline 원문에서 바뀐 곳은 세 군데뿐이다:
--      · chk 래터럴에 발급분 기한 2개(학생·학부모) 추가
--      · eff 래터럴에서 유효 기한 = least(쿠폰 기한, 발급분 기한) 계산
--        (PostgreSQL 의 least/greatest 는 NULL 을 무시한다 — 한쪽이 무기한이면
--         자연히 다른 쪽이 답이 된다)
--      · 반환 valid_until / eligible / reason 이 c.valid_until 대신 eff.until
--    나머지 판정 규칙은 원문 그대로다.
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
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
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
  where c.is_active = true
  order by c.discount_amount desc, c.slug;
end;
$$;

comment on function public.fn_usable_coupons(integer, uuid) is
  '쿠폰 판정 정본(활성 쿠폰만, sql/68 5-h절 쌍 축 재작성). p_student_profile_id 가 NULL 이면 호출자를 학생으로 보고 approved 학부모를 도출한다 — 값이 있으면 호출자가 그 학생 본인/학부모인지 검증한다(WC030). 쌍(학생+학부모)이 없으면 빈 목록. eligible/reason 은 5-d절 fn_respond_enrollment 와 동일 규칙(granted=쌍 OR+학생 우선, auto=소유 판정 없음). 반환 valid_until 은 쿠폰 기한과 발급분 기한(coupon_grants.valid_until) 중 이른 날이다(20260825000001) — 발급일 기준 기한이 붙은 쿠폰이 "무기한"으로 표시되지 않게 한다. owner_profile_id/owner_is_student 로 "누구 보유분"인지 알려준다(auto 는 owner_profile_id NULL). 한국어 라벨은 만들지 않는다 — 표기는 프론트 책임.';

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
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
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
  where c.code is not null
    and lower(c.code) = v_code
  limit 1;
end;
$$;

comment on function public.fn_coupon_by_code(text, integer, uuid) is
  '코드 직접 입력 조회 전용(sql/68 5-h절 쌍 축 재작성). code 를 입력으로만 받고 반환하지 않는다(sql/55 P1-1 유지). 학생/학부모 판정 축과 owner_profile_id/owner_is_student 는 fn_usable_coupons 와 동일 규칙(WC030 포함). 반환 valid_until 도 동일하게 쿠폰 기한과 발급분 기한 중 이른 날이다(20260825000001). 못 찾으면 0행.';

revoke all on function public.fn_usable_coupons(integer, uuid) from public;
grant execute on function public.fn_usable_coupons(integer, uuid)
  to anon, authenticated, service_role;
revoke all on function public.fn_coupon_by_code(text, integer, uuid) from public;
grant execute on function public.fn_coupon_by_code(text, integer, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8) 지갑 표시 뷰에도 발급분 기한을 노출한다
--
--    CREATE OR REPLACE VIEW 는 기존 컬럼을 그대로 두고 뒤에 더하는 것만
--    허용한다 — 그래서 grant_valid_until 을 맨 끝에 붙인다.
--
--    ⚠️ security_invoker = true 를 반드시 다시 적는다. 옵션을 생략하고 replace
--    하면 기본값으로 초기화되고, 그 순간 이 뷰가 소유자(postgres) 권한으로
--    돌아 coupon_grants 의 RLS("본인·연결된 상대 것만")를 통째로 우회한다 —
--    남의 보유 쿠폰이 보이게 된다.
-- ---------------------------------------------------------------------

create or replace view public.coupon_wallet_state
  with (security_invoker = true) as
 select g.user_id,
    c.id as coupon_id,
    c.slug,
    c.title,
    c.discount_amount,
    c.min_amount,
    c.valid_until,
    c.is_active,
    c.grant_type,
    c.max_uses_per_user,
    g.granted_at,
    g.granted_by,
    g.revoked_at,
    ( select count(*) as count
        from public.coupon_redemptions r
       where r.coupon_id = c.id and r.user_id = g.user_id and r.voided_at is null) as used_count,
    case
      when c.max_uses_per_user is null then null::bigint
      else greatest((c.max_uses_per_user - ( select count(*) as count
        from public.coupon_redemptions r
       where r.coupon_id = c.id and r.user_id = g.user_id and r.voided_at is null)), (0)::bigint)
    end as remaining_count,
    g.valid_until as grant_valid_until
   from (public.coupon_grants g
     join public.coupons c on ((c.id = g.coupon_id)));

comment on view public.coupon_wallet_state is
  '보유 쿠폰 지갑 표시용(근사치) — 결제 판정의 정본은 판정 함수(fn_coupon_is_redeemed 등)다. coupon_grants 에 행이 없는 auto 쿠폰은 나오지 않는다(정의상 보유물이 아님). remaining_count NULL=무제한. used_count 는 voided_at is null 만 세고 실패/시간창 제외 로직은 복제하지 않는다(sql/68 6절). valid_until 은 쿠폰 전체 기한, grant_valid_until 은 이 발급분의 기한이다 — 실제 사용 가능 기한은 둘 중 이른 날(20260825000001).';

-- ---------------------------------------------------------------------
-- 9) 기존 데이터 정정
--
--   a) 이미 나간 가입 발급분에 기한을 소급한다. 이 컬럼이 없던 시절 발급분은
--      NULL(무기한)인데, 그대로 두면 "6개월" 약속과 어긋난 채 영구히 남는다.
--      기준은 발급 시각이다 — 문구가 말하는 "발급일"이 그것이다.
--   b) signup-2000 의 쿠폰 전체 기한(2026-09-30)을 푼다. 이 날짜는 발급분
--      기한이 없던 시절의 대용품이었고, 그대로 두면 ① 9/30 이후 가입자는
--      fn_grant_signup_coupons_for_user 의 valid_until 조건에 걸려 발급 자체가
--      안 되고 ② 8월 가입자의 "6개월"이 5주로 잘린다. 이제 기한은 발급분이
--      가지므로 쿠폰 쪽은 무기한으로 둔다.
--      (slug 로 한정한다 — 다른 쿠폰의 기한 정책은 건드리지 않는다.)
-- ---------------------------------------------------------------------

update public.coupon_grants g
   set valid_until = ((g.granted_at at time zone 'Asia/Seoul')::date
                        + (public.fn_coupon_grant_valid_months() || ' months')::interval)::date
 where g.granted_by = 'signup'
   and g.valid_until is null
   and g.revoked_at is null;

update public.coupons
   set valid_until = null
 where slug = 'signup-2000'
   and grant_on_signup = true
   and valid_until is not null;

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것)
-- =====================================================================
-- select slug, valid_until, grant_type, grant_on_signup from public.coupons;
--   → signup-2000 의 valid_until 이 NULL 이어야 한다.
--
-- select granted_by, granted_at::date, valid_until from public.coupon_grants
--  order by granted_at desc limit 10;
--   → signup 발급분 전부 valid_until = granted_at + 6개월.
--
-- 만료 판정 재현:
--   update public.coupon_grants set valid_until = current_date - 1 where id = <id>;
--   select public.fn_coupon_is_granted('<coupon-uuid>', '<user-uuid>');  → false
--   (되돌릴 것)
-- =====================================================================
