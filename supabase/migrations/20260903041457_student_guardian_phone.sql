-- 학생 가입 — 본인 명의 휴대폰이 없는 경우 학부모 번호를 정본으로 저장한다.
--
-- 배경 —
--   학생 가입 폼에 "학생 명의의 핸드폰이 없어요" 체크박스가 있어 체크 시
--   profiles.phone에 빈 문자열('')이 저장돼 왔다. profiles_phone_key UNIQUE(phone)
--   제약(baseline:7972) 때문에 두 번째 학생부터 unique 위반으로 가입이 막힌다.
--   실제 전화번호 중복 판정은 이미 profiles_phone_unique_idx(baseline:8558, 정규화된
--   숫자 기준 + member_type is not null + phone is not null 조건부 unique index)가
--   맡고 있어 phone_key는 더 이상 필요 없다 — 오히려 ''를 중복으로 오판하는 버그의
--   원인이었으므로 제거한다.
--
--   대신 본인 명의 번호가 없는 학생은 guardian_phone(기존 컬럼, 제약 없음, 원래
--   14세 미만 법정대리인용)에 학부모 번호를 저장하는 구조로 정착시킨다. 학생은
--   phone 또는 guardian_phone 중 하나만 있으면 되고, 14세 이상 학생이 guardian_phone
--   경로를 타는 경우 그 번호도 본인 인증(purpose='guardian_signup')을 거치게 한다 —
--   학부모 동의 없이 아무 번호나 넣는 걸 막기 위해서다. 14세 미만은 기존과 동일하게
--   PASS 본인확인(identity_verifications.mobile)이 있으면 그 값이 입력값보다 우선한다.
--
-- RPC 파라미터 시그니처는 그대로 둔다(named-arg 호출이 다른 오버로드로 해석되지 않게).

-- ── 1. profiles_phone_key 제거 ──────────────────────────────────────
-- 정규화 조건부 unique 인덱스(profiles_phone_unique_idx)가 실질적인 중복 방지를
-- 이미 맡고 있으므로, ''를 중복으로 오판하던 이 제약만 제거한다.
alter table public.profiles
  drop constraint if exists profiles_phone_key;

-- 과거에 저장된 빈 문자열을 null로 정리한다 — 이후 로직은 phone이 없으면 항상
-- null이라고 가정한다(빈 문자열 상태를 남겨두면 위 unique 인덱스 조건부 필터와도
-- 어긋난다).
update public.profiles
set phone = null
where phone = '';

-- ── 2. phone_verifications.purpose에 guardian_signup·guardian_change 추가 ──
-- guardian_signup: 14세 이상 학생이 본인 번호 없이 학부모 번호로 가입할 때, 그
-- 번호가 실제로 인증된 것인지 확인하는 목적이다. api/send-phone-code.ts의
-- ALLOWED_PURPOSES 등록은 T2가 이미 완료했다(9fc55a52, 90d1e2d8).
-- guardian_change: 마이페이지에서 학부모 핸드폰을 변경할 때 쓰는 목적이다. T2가
-- api/change-phone.ts·send-phone-code.ts에서 이미 이 purpose로 발송·소비하고
-- 있어 CHECK 허용 목록에 없으면 발송 insert 자체가 실패한다.
-- 20260822000003(find_account)·20260902121935(reset_password)와 같은 이유로
-- CHECK 허용 목록에 추가해야 insert가 통과한다.
alter table public.phone_verifications
  drop constraint "phone_verifications_purpose_check";

alter table public.phone_verifications
  add constraint "phone_verifications_purpose_check"
  check (("purpose" = any (array[
    'signup'::"text",
    'parent_signup'::"text",
    'phone_change'::"text",
    'mentor_apply'::"text",
    'find_account'::"text",
    'reset_password'::"text",
    'guardian_signup'::"text",
    'guardian_change'::"text"
  ])));

-- ── 3. complete_signup_profile RPC 재정의 ───────────────────────────
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
  v_guardian_phone        text;
  v_guardian_phone_digits text;
  v_identity_rid   text;
  v_iv_id          uuid;
  v_iv_purpose     text;
  v_iv_under14     boolean;
  v_iv_birth_date  date;
  v_iv_gender      text;
  v_iv_mobile      text;
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
    select id, purpose, is_under14, birth_date, gender, mobile
      into v_iv_id, v_iv_purpose, v_iv_under14, v_iv_birth_date, v_iv_gender, v_iv_mobile
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

    -- 법정대리인(학부모) 번호도 PASS 콜백이 저장한 mobile_no가 정본이다 — 있으면
    -- 폼 입력값(p_guardian_phone)을 무시하고 덮어쓴다. 없으면 입력값을 그대로 쓴다.
    v_guardian_phone := coalesce(
      nullif(regexp_replace(coalesce(v_iv_mobile, ''), '[^0-9]', '', 'g'), ''),
      v_guardian_phone
    );
  end if;

  v_guardian_phone_digits := regexp_replace(v_guardian_phone, '[^0-9]', '', 'g');

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

  -- 학생은 본인 명의 번호 또는 학부모 번호 중 하나가 있어야 한다("학생 명의의
  -- 핸드폰이 없어요" 체크 시 phone을 비우고 guardian_phone을 채워 보낸다).
  -- 14세 미만은 위 guardian_phone_required가 이미 걸러내므로 여기는 14세 이상
  -- 학생이 phone도 guardian_phone도 안 보낸 경우를 막는 안전망이다.
  if v_member_type = 'student'
     and v_phone_digits = ''
     and v_guardian_phone_digits = '' then
    raise exception 'phone_or_guardian_required';
  end if;

  -- ── 휴대폰 인증 확인 (본인 번호) ─────────────────────────────────
  -- purpose는 가입 목적으로 발송된 것만 인정한다(find_account/reset_password 등
  -- 다른 목적 인증을 가입에 재사용하지 못하게). TTL은 30분 → 10분으로 단축한다.
  if v_phone_digits <> '' then
    select id into v_pv_id
    from public.phone_verifications
    where phone = v_phone_digits
      and purpose in ('signup', 'parent_signup')
      and verified_at is not null
      and consumed_at is null
      and verified_at > now() - interval '10 minutes'
    order by verified_at desc
    limit 1;
  end if;

  -- ── 휴대폰 인증 확인 (학부모 번호 — 14세 이상 학생이 본인 번호 대신 보낸 경우) ──
  -- 본인 번호를 비우고 학부모 번호를 보낸 14세 이상 학생만 해당한다. 14세 미만은
  -- PASS 본인확인으로 이미 검증된 번호라 별도 인증이 필요 없다.
  if v_member_type = 'student'
     and not v_under14
     and v_phone_digits = ''
     and v_guardian_phone_digits <> '' then
    select id into v_pv_id
    from public.phone_verifications
    where phone = v_guardian_phone_digits
      and purpose = 'guardian_signup'
      and verified_at is not null
      and consumed_at is null
      and verified_at > now() - interval '10 minutes'
    order by verified_at desc
    limit 1;

    if v_pv_id is null then
      raise exception 'guardian_phone_not_verified';
    end if;
  end if;

  -- [15]: 학생도 포함. 멘토는 가입 화면이 생길 때 추가한다.
  -- 만 14세 미만이 본인 번호를 비운 경우만 면제한다(위 (3)-c 주석). 14세 이상
  -- 학생이 학부모 번호 경로를 탄 경우는 바로 위 블록에서 이미 v_pv_id를 채웠거나
  -- guardian_phone_not_verified로 걸러졌으므로 여기서 추가로 막을 필요가 없다.
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
  -- guardian_phone은 검사하지 않는다(학부모 본인 계정 번호·형제 공유가 정상).
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
    v_user_id, v_name, v_username, nullif(v_phone, ''), v_email, nullif(v_region, ''),
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
