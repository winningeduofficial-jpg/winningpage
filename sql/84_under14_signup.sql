-- =====================================================================
-- 만 14세 미만 가입(D-2) 서버 배선
--   (1) identity_verifications.consumed_at — 본인확인 1회용 강제
--   (2) profiles.guardian_phone / guardian_consent — 법정대리인 정보
--   (3) complete_signup_profile 확장 — 법정대리인 본인확인 검증·소비
-- Supabase SQL Editor / Management API에서 수동 실행 필요.
-- 선행: sql/40_auth_signup.sql ([6] phone_verifications, [11][12]
--       identity_verifications, [15] complete_signup_profile)
--
-- 왜 필요했나
--   D-2(Under14Form) "다음" 버튼이 스텁이었다. 배선하려 보니 가입 RPC가
--   법정대리인 정보도, 본인확인 결과도 받을 자리가 없었다. 40번 [11] 주석이
--   적어둔 구멍("인증 결과를 가입 RPC가 소비하지 않는다 — consumed_at을 찍는
--   주체가 없다")이 그대로 남아 있었던 것이다. 프론트만 이으면 어렵게 붙인
--   NICE 본인확인이 서버에서 검증되지 않은 채 가입이 끝나므로 여기서 막는다.
--
-- 재실행 안전성: 전 문장이 idempotent 하다(add column if not exists /
--   create index if not exists / drop function if exists → create).
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) identity_verifications.consumed_at
--
--     phone_verifications([6])와 같은 원칙이다. verified_at만으로는 같은
--     인증 1건으로 여러 계정을 만들 수 있어서, 실제 가입에 쓰인 시각을 찍어
--     1회용으로 강제한다.
--
--     verified_at을 그대로 두고 컬럼을 따로 두는 이유도 [6]과 같다 — "인증에
--     성공한 시각"과 "그 인증이 소비된 시각"은 다른 사실이고, 콜백은 전자만
--     알 수 있다.
-- ---------------------------------------------------------------------

alter table public.identity_verifications
  add column if not exists consumed_at timestamptz;

comment on column public.identity_verifications.consumed_at is
  '가입 완료에 실제로 사용된 시각. 재사용 방지(1회용 강제).';

-- 가입 RPC가 request_id로 "아직 안 쓴 인증"을 찾는 경로.
create index if not exists identity_verifications_consumable_idx
  on public.identity_verifications (request_id)
  where status = 'verified' and consumed_at is null;


-- ---------------------------------------------------------------------
-- (2) profiles 법정대리인 컬럼
--
--     D-2가 받는 값은 두 가지다: 법정대리인 연락처와 "법정대리인 정보를
--     학부모 정보로 수집합니다" 동의.
--
--     ⚠️ 법정대리인의 이름·생년월일·CI/DI는 여기에 복사하지 않는다.
--       그 값들은 이미 identity_verifications 행에 있고, 가입 시점에
--       user_id를 채워 계정과 잇는다(아래 (3)). 개인정보를 두 곳에 두면
--       한쪽만 지워지는 사고가 나므로 정본은 한 곳으로 둔다.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists guardian_phone text,
  add column if not exists guardian_consent boolean default false;

comment on column public.profiles.guardian_phone is
  '법정대리인 연락처(만 14세 미만 가입). 본인확인된 번호는 identity_verifications.mobile.';
comment on column public.profiles.guardian_consent is
  '법정대리인 정보를 학부모 정보로 수집하는 것에 대한 동의(D-2).';


-- ---------------------------------------------------------------------
-- (3) complete_signup_profile — 법정대리인 본인확인 검증·소비
--
--     [15]에서 확장한 본문에 아래 세 가지를 더한다.
--
--     a) p_identity_request_id 가 오면 그 인증을 검증한다.
--        status='verified' / consumed_at is null / 30분 이내 /
--        purpose='under14_guardian' / is_under14 가 참이 아닐 것.
--        마지막 조건은 "법정대리인은 만 14세 이상"이라는 화면 규칙
--        (identityVerification.ts 의 guardian_age 메시지)을 서버에서도 세우는 것이다.
--
--     b) 만 14세 미만 가입이면 법정대리인 연락처·동의를 필수로 본다.
--
--     c) 휴대폰 인증 강제([15])를 만 14세 미만에 한해 완화한다.
--        본인 번호가 없는 아이가 있어서(D-2 의 noOwnPhone 체크박스) 번호를
--        비우면 [15] 규칙에 그대로 걸린다. 이 경우 법정대리인 본인확인이
--        그 자리를 대신하므로 면제한다. **번호를 적었다면 면제하지 않는다** —
--        적어낸 번호는 여전히 인증을 거쳐야 한다.
--
--     ⚠️ 남는 구멍: 서버는 가입자가 실제로 만 14세 미만인지 모른다.
--       생년월일이 RPC로 넘어오지 않아서, 클라이언트가 D-2 대신 C-1(학생 폼)로
--       가면 법정대리인 인증 없이 가입할 수 있다. 다만 그 경로는 본인 명의
--       휴대폰 인증을 통과해야 하므로 신뢰 수준이 지금보다 낮아지지는 않는다.
--       생년월일까지 서버가 판정하려면 별도 작업이 필요하다.
-- ---------------------------------------------------------------------

drop function if exists public.complete_signup_profile(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, boolean
);

create or replace function public.complete_signup_profile(
  p_name                      text,
  p_username                  text,
  p_phone                     text,
  p_email                     text,
  p_region                    text,
  p_school_type               text,
  p_school_name               text,
  p_member_type               text,
  p_terms_service_agreed      boolean,
  p_privacy_required_agreed   boolean,
  p_identity_required_agreed  boolean,
  p_privacy_optional_agreed   boolean,
  p_marketing_agreed          boolean,
  p_ads_agreed                boolean,
  p_guardian_phone            text    default null,
  p_guardian_consent          boolean default false,
  p_identity_request_id       text    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id        uuid;
  v_name           text;
  v_username       text;
  v_phone          text;
  v_phone_digits   text;
  v_pv_id          uuid;
  v_email          text;
  v_region         text;
  v_school_type    text;
  v_school_name    text;
  v_member_type    text;
  v_link_code      text;
  v_guardian_phone text;
  v_identity_rid   text;
  v_iv_id          uuid;
  v_iv_purpose     text;
  v_iv_under14     boolean;
  v_under14        boolean := false;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  v_name        := trim(coalesce(p_name, ''));
  v_email       := lower(trim(coalesce(p_email, '')));
  v_username    := lower(trim(coalesce(nullif(p_username, ''), v_email)));
  v_phone       := trim(coalesce(p_phone, ''));
  v_region      := trim(coalesce(p_region, ''));
  v_school_type := trim(coalesce(p_school_type, ''));
  v_school_name := trim(coalesce(p_school_name, ''));
  v_member_type := lower(trim(coalesce(p_member_type, '')));

  v_guardian_phone := trim(coalesce(p_guardian_phone, ''));
  v_identity_rid   := trim(coalesce(p_identity_request_id, ''));

  -- 저장은 입력값 그대로 두고(기존 동작 유지), 조회만 숫자로 정규화한다.
  v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');

  if v_name = '' then
    raise exception 'name_required';
  end if;

  if v_email = '' then
    raise exception 'email_required';
  end if;

  if v_username = '' then
    v_username := v_email;
  end if;

  if v_member_type = '' then
    raise exception 'member_type_required';
  end if;

  if v_member_type not in ('student', 'parent', 'mentor') then
    raise exception 'invalid_member_type';
  end if;

  -- 지역·재학 구분은 학생에게만 필수([13]).
  if v_member_type = 'student' and v_region = '' then
    raise exception 'region_required';
  end if;

  if v_member_type = 'student' and v_school_type = '' then
    raise exception 'school_type_required';
  end if;

  if coalesce(p_terms_service_agreed, false) is not true then
    raise exception 'terms_service_required';
  end if;

  if coalesce(p_privacy_required_agreed, false) is not true then
    raise exception 'privacy_required';
  end if;

  -- 본인 인증 정보 수집 동의는 학생 약관에만 있는 항목이다.
  if v_member_type = 'student'
     and coalesce(p_identity_required_agreed, false) is not true then
    raise exception 'identity_required';
  end if;

  -- ── 법정대리인 본인확인 (만 14세 미만) ──────────────────────────
  if v_identity_rid <> '' then
    select id, purpose, is_under14
      into v_iv_id, v_iv_purpose, v_iv_under14
    from public.identity_verifications
    where request_id = v_identity_rid
      and status = 'verified'
      and consumed_at is null
      and verified_at > now() - interval '30 minutes'
    limit 1;

    if v_iv_id is null then
      raise exception 'identity_not_verified';
    end if;

    if v_iv_purpose is distinct from 'under14_guardian' then
      raise exception 'identity_purpose_mismatch';
    end if;

    -- 법정대리인이 만 14세 미만이면 대리인이 될 수 없다.
    if coalesce(v_iv_under14, false) then
      raise exception 'guardian_age';
    end if;

    v_under14 := true;
  end if;

  if v_under14 then
    if v_guardian_phone = '' then
      raise exception 'guardian_phone_required';
    end if;

    if coalesce(p_guardian_consent, false) is not true then
      raise exception 'guardian_consent_required';
    end if;
  end if;

  -- ── 휴대폰 인증 확인 ────────────────────────────────────────────
  if v_phone_digits <> '' then
    select id into v_pv_id
    from public.phone_verifications
    where phone = v_phone_digits
      and verified_at is not null
      and consumed_at is null
      and verified_at > now() - interval '30 minutes'
    order by verified_at desc
    limit 1;
  end if;

  -- [15]: 학생도 포함. 멘토는 가입 화면이 생길 때 추가한다.
  -- 만 14세 미만이 본인 번호를 비운 경우만 면제한다(위 (3)-c 주석).
  if v_member_type in ('parent', 'student')
     and v_pv_id is null
     and not (v_under14 and v_phone_digits = '') then
    raise exception 'phone_not_verified';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(trim(email)) = v_email
      and id <> v_user_id
  ) then
    raise exception 'duplicate_email';
  end if;

  -- ── [16] 전화번호 중복 ──────────────────────────────────────────
  if v_phone_digits <> '' and exists (
    select 1
    from public.profiles
    where id <> v_user_id
      and member_type is not null
      and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ) then
    raise exception 'duplicate_phone';
  end if;

  insert into public.profiles (
    id, name, username, phone, email, region,
    school_type, school_name, member_type, role,
    terms_service_agreed, privacy_required_agreed, privacy_optional_agreed,
    marketing_agreed, ads_agreed, guardian_phone, guardian_consent, updated_at
  )
  values (
    v_user_id, v_name, v_username, v_phone, v_email, nullif(v_region, ''),
    nullif(v_school_type, ''), nullif(v_school_name, ''), v_member_type, 'user',
    coalesce(p_terms_service_agreed, false),
    coalesce(p_privacy_required_agreed, false),
    coalesce(p_privacy_optional_agreed, false),
    coalesce(p_marketing_agreed, false),
    coalesce(p_ads_agreed, false),
    nullif(v_guardian_phone, ''),
    coalesce(p_guardian_consent, false),
    now()
  )
  on conflict (id) do update
  set
    name                    = excluded.name,
    username                = excluded.username,
    phone                   = excluded.phone,
    email                   = excluded.email,
    region                  = excluded.region,
    school_type             = excluded.school_type,
    school_name             = excluded.school_name,
    member_type             = excluded.member_type,
    role                    = coalesce(public.profiles.role, 'user'),
    terms_service_agreed    = excluded.terms_service_agreed,
    privacy_required_agreed = excluded.privacy_required_agreed,
    privacy_optional_agreed = excluded.privacy_optional_agreed,
    marketing_agreed        = excluded.marketing_agreed,
    ads_agreed              = excluded.ads_agreed,
    -- 재호출로 이미 채운 법정대리인 정보를 빈 값이 덮지 않게 한다.
    guardian_phone          = coalesce(excluded.guardian_phone, public.profiles.guardian_phone),
    guardian_consent        = excluded.guardian_consent or coalesce(public.profiles.guardian_consent, false),
    updated_at              = now();

  -- 인증 기록을 소비 처리한다. 같은 인증으로 두 번 가입할 수 없게 한다.
  if v_pv_id is not null then
    update public.phone_verifications
    set consumed_at = now()
    where id = v_pv_id;
  end if;

  -- 본인확인도 같은 원칙으로 소비하고, 이제서야 생긴 계정과 잇는다.
  -- user_id를 여기서 채우는 이유는 가입 전 인증이라 그 시점엔 계정이 없어서다([11]).
  if v_iv_id is not null then
    update public.identity_verifications
    set consumed_at = now(),
        user_id     = v_user_id
    where id = v_iv_id;
  end if;

  -- 약관 동의 이력 (버전 단위).
  insert into public.user_term_agreements (user_id, term_id, agreed)
  select
    v_user_id,
    t.id,
    case
      when t.code ~ '_identity$'                        then coalesce(p_identity_required_agreed, false)
      when t.profile_column = 'terms_service_agreed'    then coalesce(p_terms_service_agreed, false)
      when t.profile_column = 'privacy_required_agreed' then coalesce(p_privacy_required_agreed, false)
      when t.profile_column = 'marketing_agreed'        then coalesce(p_marketing_agreed, false)
      when t.profile_column = 'ads_agreed'              then coalesce(p_ads_agreed, false)
      else false
    end
  from public.terms t
  where t.is_active
    and t.audience in (v_member_type, 'common')
  on conflict (user_id, term_id) do update
  set agreed    = excluded.agreed,
      agreed_at = now();

  -- 학생 연결코드: 없을 때만 발급한다(재호출로 코드가 회전하면 안 된다).
  if v_member_type = 'student' then
    select code into v_link_code
    from public.student_link_codes
    where student_id = v_user_id
      and is_active;

    if v_link_code is null then
      v_link_code := public.issue_student_link_code(v_user_id);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_user_id,
    'email', v_email,
    'member_type', v_member_type,
    'under14', v_under14,
    'link_code', v_link_code   -- 학생이 아니면 null
  );
end;
$function$;

-- 권한 의도(anon 금지) 재확인. 40번 [15] 주석과 같은 이유로 본문 뒤에 둔다.
revoke all on function public.complete_signup_profile(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, boolean,
  text, boolean, text
) from public, anon;

grant execute on function public.complete_signup_profile(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, boolean,
  text, boolean, text
) to authenticated, service_role;


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- -- (1) 컬럼이 생겼는지
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and (
--     (table_name = 'identity_verifications' and column_name = 'consumed_at')
--     or (table_name = 'profiles' and column_name in ('guardian_phone', 'guardian_consent'))
--   );
--
-- -- (2) 함수가 17개 인자 하나만 남았는지 (14개짜리가 같이 보이면 drop 실패)
-- select p.oid::regprocedure
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'complete_signup_profile';
--
-- -- (3) 소비되지 않은 본인확인 (가입 직후엔 방금 쓴 건이 사라져 있어야 한다)
-- select request_id, purpose, status, verified_at, consumed_at, user_id
-- from public.identity_verifications
-- order by requested_at desc limit 10;
