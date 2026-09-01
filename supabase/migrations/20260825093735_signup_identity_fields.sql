-- T8 — 회원가입 생년월일·성별 필수 + 소속코드 선택 (QA 시트 2026-08-22 지시).
--
-- 왜 RPC 확장인가 —
--   가입 프로필 저장은 auth 트리거가 아니라 RPC public.complete_signup_profile
--   하나가 담당한다(handle_new_user 트리거는 id/email만 넣는다). 학생(14세 이상)/
--   14세 미만/학부모 세 폼이 전부 이 RPC를 호출하므로, 신규 필수값도 여기에 얹는다.
--
-- PASS 우선 규칙 —
--   14세 미만(법정대리인 PASS 본인확인을 거친) 가입은 identity_verifications에 이미
--   NICE 응답으로 채워진 birth_date/gender가 정본이다. 프런트가 입력칸을 두지 않고
--   p_birth_date/p_gender를 보내지 않으므로, RPC가 identity_verifications에서 직접
--   읽어 그 값을 쓴다 — 사용자가 폼을 조작해 실제 본인확인 값과 다른 생년월일/성별을
--   보낼 길을 원천 차단한다.
--
-- gender CHECK를 not valid로 거는 이유 —
--   profiles.gender는 지금까지 관행상 채운 곳이 없어 비어 있어야 정상이지만, 혹시
--   모를 레거시 값(NICE 원문 코드 등 '남'/'여' 밖의 값)이 있으면 일반 add constraint는
--   기존 행 전수검사에서 실패한다. not valid로 걸어 신규/갱신 행부터 즉시 적용하고,
--   기존 행 백필 후 validate constraint는 별도 마이그레이션에서 처리한다.

-- ── 1. profiles 컬럼 추가 ───────────────────────────────────────────
alter table public.profiles
  add column if not exists org_code text;

comment on column public.profiles.org_code is
  '고객 소속 분류용 코드 — 선택 입력, 검증 규칙 없음(QA 2026-08-22). 향후 소속
   마스터 테이블이 생기면 FK로 전환할 수 있다.';

alter table public.profiles
  add constraint profiles_gender_check
  check (gender is null or gender in ('남', '여')) not valid;

comment on constraint profiles_gender_check on public.profiles is
  'not valid로 추가 — 과거에 채워졌을 수 있는 레거시 값이 있으면 일반 add constraint가
   기존 행 전수검사에서 실패하기 때문이다. 신규/갱신 행부터는 즉시 적용된다. validate는
   바로 다음 마이그레이션(20260825113811)이 따로 수행한다 — 한 파일에 두면 레거시 값
   하나 때문에 RPC 교체까지 통째로 실패한다.';

-- ── 2. complete_signup_profile RPC 확장 ────────────────────────────
-- 기존 17개 파라미터의 순서·이름은 그대로 두고 끝에 3개만 DEFAULT NULL로 추가한다.
-- 순서를 바꾸면 supabase-js의 named-arg RPC 호출이 다른 오버로드로 해석될 수 있어서다.
-- 먼저 기존 시그니처 함수를 지워 오버로드 모호성을 없앤 뒤 새 시그니처로 만든다.
drop function if exists public.complete_signup_profile(
  "text", "text", "text", "text", "text", "text", "text", "text",
  boolean, boolean, boolean, boolean, boolean, boolean,
  "text", boolean, "text"
);

CREATE OR REPLACE FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text" DEFAULT NULL::"text", "p_guardian_consent" boolean DEFAULT false, "p_identity_request_id" "text" DEFAULT NULL::"text", "p_birth_date" "date" DEFAULT NULL::"date", "p_gender" "text" DEFAULT NULL::"text", "p_org_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
  v_iv_birth_date  date;
  v_iv_gender      text;
  v_under14        boolean := false;
  v_birth_date     date;
  v_gender         text;
  v_org_code       text;
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

  -- ── 생년월일·성별 (QA 2026-08-22) ──────────────────────────────
  -- 우선 입력값을 그대로 정규화·검증한다. 14세 미만 흐름은 프런트가 이 두 값을 보내지
  -- 않으므로(PASS 값이 정본) 여기서는 통과하고, 아래 법정대리인 본인확인 블록에서
  -- identity_verifications 값으로 덮어쓴다.
  v_birth_date := p_birth_date;
  v_gender     := nullif(trim(coalesce(p_gender, '')), '');
  -- 소속코드는 지금 자유 문자열(검증 규칙 없음 — 향후 기관 마스터 FK 전환 예정). 대소문자·
  -- 앞뒤 공백만 정규화해 두면 나중에 마스터와 맞출 때 'org-01'/'ORG-01 ' 같은 변형을
  -- 따로 정리하지 않아도 된다.
  v_org_code   := nullif(upper(trim(coalesce(p_org_code, ''))), '');

  if v_gender is not null and v_gender not in ('남', '여') then
    raise exception 'invalid_gender';
  end if;

  -- ── 법정대리인 본인확인 (만 14세 미만) ──────────────────────────
  if v_identity_rid <> '' then
    select id, purpose, is_under14, birth_date, gender
      into v_iv_id, v_iv_purpose, v_iv_under14, v_iv_birth_date, v_iv_gender
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

    -- PASS 실명 정보가 정본이다 — 폼에서 보낸 p_birth_date/p_gender는 무시한다.
    -- NICE 성별코드 관례: 홀수(1/3/5/7)=남, 짝수 계열(0/2/4/6/8)=여
    -- (0/2/4/6/8은 내국인/외국인·출생연도대별 조합, 매핑에 없는 값이면 null).
    v_birth_date := v_iv_birth_date;
    v_gender := case
      when v_iv_gender in ('1', '3', '5', '7') then '남'
      when v_iv_gender in ('0', '2', '4', '6', '8') then '여'
      else null
    end;
  end if;

  if v_under14 then
    if v_guardian_phone = '' then
      raise exception 'guardian_phone_required';
    end if;

    if coalesce(p_guardian_consent, false) is not true then
      raise exception 'guardian_consent_required';
    end if;
  end if;

  -- 14세 이상 학생·학부모는 생년월일·성별이 필수다(멘토는 가입 화면이 아직 없어 제외).
  if not v_under14 and v_member_type in ('student', 'parent') then
    if v_birth_date is null then
      raise exception 'birth_date_required';
    end if;

    if v_gender is null then
      raise exception 'gender_required';
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
    marketing_agreed, ads_agreed, guardian_phone, guardian_consent,
    birth_date, gender, org_code, updated_at
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
    v_birth_date, v_gender, v_org_code,
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
    -- 생년월일·성별·소속코드도 같은 원칙 — 재호출(예: 재시도)로 이번엔 비어 온 값이
    -- 이전에 채워진 값을 지우지 않게 한다.
    birth_date              = coalesce(excluded.birth_date, public.profiles.birth_date),
    gender                  = coalesce(excluded.gender, public.profiles.gender),
    org_code                = coalesce(excluded.org_code, public.profiles.org_code),
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
$_$;

ALTER FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") TO "service_role";
