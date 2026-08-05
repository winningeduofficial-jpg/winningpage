-- =====================================================================
-- 로그인/회원가입 백엔드 스키마 (누적 파일)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
--
-- 이 파일은 로그인/회원가입 태스크의 SQL을 순서대로 누적한다.
-- 섹션은 아래로만 추가하고, 이미 실행된 섹션은 수정하지 않는다.
--
--   [1] profiles.member_type 회원유형 제약 (student/parent/mentor)
--   [2] terms                  : 약관 버전 레지스트리
--   [3] user_term_agreements   : 회원별 약관 동의 이력 (버전 단위)
--   [4] student_link_codes     : 학생 연결코드(재발급형) + 발급 함수
--   [5] parent_child_links     : 학부모-자녀 연결 (학생 승인 필수)
--   [6] phone_verifications    : 휴대폰 인증코드 (서버 전용)
--   [7] complete_signup_profile 확장 (학부모·멘토 가입 개통, 약관 이력 기록)
--   [8] 연결 RPC 4종 (요청/응답/해제/코드 재발급)
--   [9] check_email_signup_state : 가입 중단 계정 이어가기 판정
--
-- 의존: 00_base_schema.sql (profiles, is_winning_admin(), extensions.pgcrypto)
-- =====================================================================

-- 1회성 데이터 보정을 최초 1회만 적용하기 위한 마커 테이블.
-- 20/30번에서 이미 생성되지만, 40번만 단독 실행하는 dev 환경을 위해 재선언한다.
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);


-- =====================================================================
-- [1] profiles.member_type : 회원유형 3종 제약
--
-- 2026-07-31 미팅 확정: 학생 / 학부모 / 멘토 3종.
-- 기존 컬럼(00_base_schema.sql:795)은 제약 없는 text라 표기가 섞여 있을 수
-- 있어(레거시 한글값, 'teacher' 등) 제약을 걸기 전에 정규화한다.
--
-- 'teacher' -> 'mentor' 정규화가 필요한 이유: 프론트 2곳이 멘토를 'teacher'로
-- 써왔다(src/pages/MyPage.jsx MEMBER_TYPES, src/pages/Admin.jsx 회원 편집).
-- 확정 표기는 'mentor'이므로 같은 커밋에서 프론트도 함께 교정했다.
-- src/components/Header.jsx:75는 이미 양쪽을 모두 '멘토회원'으로 표시한다.
--
-- 정규화 UPDATE에는 마커를 걸지 않는다 — 표기 통일은 관리자가 고른 값을
-- 덮어쓰는 성격이 아니고, 반복 실행해도 결과가 같다(멱등).
-- =====================================================================

update public.profiles
set member_type = case lower(trim(member_type))
  when '학생'       then 'student'
  when '학생회원'   then 'student'
  when 'students'   then 'student'
  when '학부모'     then 'parent'
  when '학부모회원' then 'parent'
  when 'parents'    then 'parent'
  when '멘토'       then 'mentor'
  when '멘토회원'   then 'mentor'
  when '교사'       then 'mentor'
  when 'teacher'    then 'mentor'
  else member_type
end
where member_type is not null
  and lower(trim(member_type)) in (
    '학생', '학생회원', 'students',
    '학부모', '학부모회원', 'parents',
    '멘토', '멘토회원', '교사', 'teacher'
  );

-- 가입 미완료 계정 등에서 빈 문자열이 들어온 경우 null로 정리한다.
-- (complete_signup_profile은 trim 후 ''를 member_type_required로 막지만,
--  구 Signup.jsx 경로로 만들어진 행이 남아 있을 수 있다.)
update public.profiles
set member_type = null
where member_type is not null
  and trim(member_type) = '';

-- 정규화 후에도 미허용 값이 남아 있으면 제약 추가가 23514로 실패한다.
-- 어떤 값이 걸림돌인지 먼저 알려주고 멈춘다(위 case 문에 매핑을 추가할 것).
do $$
declare
  v_bad text;
begin
  select string_agg(distinct quote_literal(member_type), ', ')
    into v_bad
  from public.profiles
  where member_type is not null
    and member_type not in ('student', 'parent', 'mentor');

  if v_bad is not null then
    raise exception
      '40_auth_signup [1]: profiles.member_type에 허용되지 않는 값이 남아 있습니다 -> %. 위 정규화 case에 매핑을 추가한 뒤 다시 실행하세요.',
      v_bad;
  end if;
end $$;

-- null 허용: profiles 행은 가입 완료(complete_signup_profile) 전에도 생성되며,
-- 그 시점에는 회원유형이 아직 정해지지 않는다.
alter table public.profiles drop constraint if exists profiles_member_type_check;
alter table public.profiles add constraint profiles_member_type_check
  check (member_type is null or member_type in ('student', 'parent', 'mentor'));


-- =====================================================================
-- [2] terms : 약관 버전 레지스트리
--
-- 주의: 00_base_schema.sql:241의 admin_terms는 "학기"(admin_classes.term_id)로
-- 전혀 다른 테이블이다. 이 terms는 법적 약관을 뜻한다.
--
-- 동의를 "약관 버전 단위"로 기록하기 위한 상위 테이블. 약관이 개정되면
-- 같은 code의 새 version 행을 추가하고 구 버전은 is_active=false로 둔다.
-- 그러면 나중에 재동의 대상(= 구 버전에만 동의한 회원)을 산출할 수 있다.
-- 재동의 플로우 자체는 1차 산출물 제외(2026-07-31 확정).
--
-- content가 nullable인 이유: 현재 약관 본문은 src/pages/terms/*.jsx에
-- 하드코딩돼 있고, 본문을 DB로 옮기는 작업은 이 커밋의 범위가 아니다.
-- 관리자 약관 수정 기능을 붙일 때 이 컬럼을 채우면 스키마 변경 없이 전환된다.
-- 그때까지 route가 회원에게 보여줄 실제 본문의 위치다.
-- =====================================================================

create table if not exists public.terms (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,                   -- 약관 식별자 (버전 무관), 예: 'student_service'
  version        text not null,                   -- 버전 라벨, 예: 'v1'
  audience       text not null default 'common'
                 check (audience in ('student', 'parent', 'mentor', 'common')),
  title          text not null,                   -- 약관 페이지 제목 (src/pages/terms/* title prop과 동일)
  route          text,                            -- 본문 프론트 라우트, 예: '/terms/student/service'
  content        text,                            -- 본문 (DB 이관 전까지 null)
  is_required    boolean not null default true,   -- 필수 동의 여부
  profile_column text,                            -- 대응되는 legacy profiles 불리언 컬럼 (없으면 null)
  effective_from date not null default current_date,
  is_active      boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

-- 같은 약관의 같은 버전은 1건만 존재한다.
create unique index if not exists terms_code_version_key
  on public.terms (code, version);

-- 활성 버전은 약관별로 1건만 허용한다 (현행 약관 조회가 항상 단건이 되도록).
create unique index if not exists terms_active_code_key
  on public.terms (code) where is_active;

create index if not exists terms_audience_idx
  on public.terms (audience, sort_order) where is_active;

alter table public.terms enable row level security;

-- 공개 read: 가입 화면이 로그인 전에 약관 목록을 읽어야 하므로 활성 버전은 공개.
-- 구 버전은 관리자만 조회 가능(재동의 대상 산출·이력 확인 용도).
drop policy if exists "terms public read" on public.terms;
create policy "terms public read" on public.terms
  for select using (is_active = true or public.is_winning_admin());

-- admin write: profiles 직접 서브쿼리는 42P17 무한재귀 → is_winning_admin() 경유 (sql/README.md 참고)
drop policy if exists "terms admin write" on public.terms;
create policy "terms admin write" on public.terms
  for all
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- terms 시드 v1 : 현재 프론트에 존재하는 약관 8종
--   학생 5종 - src/pages/signup/StudentForm.jsx:56-75 / UnifiedSignupForm.jsx:78-97
--   학부모 3종 - src/pages/signup/parent/ParentForm.jsx:37-39
-- 멘토 약관은 아직 화면·본문이 없어 시드하지 않는다(가입 유형만 3종 확정).
--
-- profile_column은 complete_signup_profile이 지금 쓰고 있는 legacy 불리언과의
-- 대응이다. student_identity만 null인데, 이게 프론트가 남긴 GAP이다 —
-- "본인 인증을 위한 정보 수집" 필수 동의를 받을 컬럼도 RPC 파라미터도 없어
-- 현재는 클라이언트 검증만 되고 있다(StudentForm.jsx:441 TODO).
-- 이 파일 [5] complete_signup_profile 확장에서 처리한다.
--
-- (code, version) 중복 시 no-op이라 재실행에 안전하고, 관리자가 수정한
-- title/route/is_active는 재실행으로 되돌아가지 않는다.
-- ---------------------------------------------------------------------
insert into public.terms
  (code, version, audience, title, route, is_required, profile_column, sort_order)
select
  v.code, 'v1', v.audience, v.title, v.route, v.is_required, v.profile_column, v.sort_order
from (
  values
    ('student_service',   'student', '학생회원 위닝에듀 이용약관',
     '/terms/student/service',   true,  'terms_service_agreed',    10),
    ('student_privacy',   'student', '학생회원 개인정보 수집 및 이용',
     '/terms/student/privacy',   true,  'privacy_required_agreed', 20),
    ('student_identity',  'student', '학생회원 본인 인증을 위한 정보 수집',
     '/terms/student/identity',  true,  null,                      30),
    ('student_marketing', 'student', '학생회원 마케팅 목적의 개인정보 수집 및 이용',
     '/terms/student/marketing', false, 'marketing_agreed',        40),
    ('student_promotion', 'student', '학생회원 합격사례·후기 홍보 활용 동의',
     '/terms/student/promotion', false, 'ads_agreed',              50),
    ('parent_service',    'parent',  '학부모회원 위닝에듀 이용약관',
     '/terms/parent/service',    true,  'terms_service_agreed',    10),
    ('parent_privacy',    'parent',  '학부모회원 개인정보 수집 및 이용',
     '/terms/parent/privacy',    true,  'privacy_required_agreed', 20),
    ('parent_marketing',  'parent',  '학부모회원 마케팅 목적의 개인정보 수집 및 이용',
     '/terms/parent/marketing',  false, 'marketing_agreed',        30)
) as v(code, audience, title, route, is_required, profile_column, sort_order)
where not exists (
  select 1 from public.terms t
  where t.code = v.code and t.version = 'v1'
);


-- =====================================================================
-- [3] user_term_agreements : 회원별 약관 동의 이력
--
-- term_id가 버전까지 특정하므로 (user_id, term_id) 유니크면 "이 회원이 이
-- 버전에 동의했는가"가 그대로 표현된다. 약관 개정 시에는 새 버전 행이
-- 생기므로 기존 동의 이력을 덮어쓰지 않고 누적된다.
--
-- agreed를 boolean으로 두는 이유: 선택 약관을 "거부함"으로 명시 기록해야
-- 미동의와 미응답을 구분할 수 있다(마케팅 수신 분쟁 대응).
-- =====================================================================

create table if not exists public.user_term_agreements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  term_id    uuid not null references public.terms(id) on delete restrict,
  agreed     boolean not null,
  agreed_at  timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists user_term_agreements_user_term_key
  on public.user_term_agreements (user_id, term_id);

create index if not exists user_term_agreements_term_idx
  on public.user_term_agreements (term_id);

alter table public.user_term_agreements enable row level security;

-- 본인 조회만 허용(마이페이지 동의 내역) + 관리자 조회.
-- insert/update/delete 정책은 두지 않는다 — 동의 기록은 반드시
-- complete_signup_profile 등 security definer RPC를 통해서만 쓰이며,
-- 클라이언트가 임의로 동의 이력을 만들거나 지울 수 없어야 한다.
drop policy if exists "user_term_agreements own read" on public.user_term_agreements;
create policy "user_term_agreements own read" on public.user_term_agreements
  for select using (user_id = auth.uid() or public.is_winning_admin());


-- =====================================================================
-- [4] student_link_codes : 학생 연결코드 (재발급형)
--
-- 2026-07-31 미팅 확정 모델:
--   - 코드는 "학생에게 귀속"된다. 1회성 초대(child_invitations) 모델이 아니다.
--   - 자동 회전 없음. 학생이 마이페이지에서 재발급을 눌렀을 때만 새 코드가
--     생기고, 이전 코드는 is_active=false로 남겨 이력을 보존한다.
--   - 숫자+영문 6자리 (기존 숫자 6자리 폐기).
--
-- 알파벳 31자 '23456789ABCDEFGHJKMNPQRSTUVWXYZ' — 0/O, 1/I/L을 뺐다.
-- 코드를 육성으로 불러주거나 손으로 받아적는 상황(학부모-자녀)이 기본이라
-- 혼동되는 글자를 빼는 쪽이 경우의 수(31^6 = 약 8.8억)보다 중요하다.
--
-- 코드 유출 위험도: 코드를 안다고 연결되지 않는다. 학부모의 연결 요청은
-- pending으로 쌓이고 학생 승인이 있어야 approved가 된다([5] parent_child_links).
-- =====================================================================

create table if not exists public.student_link_codes (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references auth.users(id) on delete cascade,
  code           text not null,
  is_active      boolean not null default true,
  issued_at      timestamptz not null default now(),
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  constraint student_link_codes_code_format
    check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$')
);

-- 활성 코드는 전역에서 유일해야 한다 — 학부모가 코드만으로 학생을 특정하므로.
-- 비활성 코드는 중복을 허용한다(이력 보존이 목적이고, 조회는 활성 건만 본다).
create unique index if not exists student_link_codes_active_code_key
  on public.student_link_codes (code) where is_active;

-- 학생당 활성 코드는 1건. 재발급이 "교체"가 되도록 보장한다.
create unique index if not exists student_link_codes_active_student_key
  on public.student_link_codes (student_id) where is_active;

create index if not exists student_link_codes_student_idx
  on public.student_link_codes (student_id, issued_at desc);

alter table public.student_link_codes enable row level security;

-- 본인(학생) 조회만 + 관리자. 학부모의 코드 조회는 RLS를 타지 않는다 —
-- api/lookup-child.js가 service_role로 조회하며 rate limit을 건다(커밋 8).
-- write 정책은 두지 않는다: 발급은 아래 security definer 함수 경유만 허용.
drop policy if exists "student_link_codes own read" on public.student_link_codes;
create policy "student_link_codes own read" on public.student_link_codes
  for select using (student_id = auth.uid() or public.is_winning_admin());

-- ---------------------------------------------------------------------
-- generate_link_code_string() : 코드 문자열 6자 생성 (충돌 검사 없음)
--
-- random() 대신 pgcrypto를 쓴다. pgcrypto는 extensions 스키마에 설치돼
-- 있으므로(00_base_schema.sql:18) search_path와 무관하게 스키마 한정 호출한다.
--
-- 256 % 31 = 8이라 바이트를 그냥 31로 나눈 나머지를 쓰면 앞쪽 8글자가 더
-- 자주 나온다. 248(=8*31) 이상인 바이트는 버리고 다시 뽑아 편향을 없앤다.
-- ---------------------------------------------------------------------
create or replace function public.generate_link_code_string()
returns text
language plpgsql
volatile
set search_path to 'public'
as $function$
declare
  c_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  c_len      constant int  := length(c_alphabet);              -- 31
  c_limit    constant int  := (256 / c_len) * c_len;           -- 248
  v_code text := '';
  v_byte int;
begin
  while length(v_code) < 6 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < c_limit then
      v_code := v_code || substr(c_alphabet, (v_byte % c_len) + 1, 1);
    end if;
  end loop;

  return v_code;
end;
$function$;

-- ---------------------------------------------------------------------
-- issue_student_link_code(student_id) : 발급/재발급 (내부 전용)
--
-- 기존 활성 코드를 비활성화하고 새 코드를 1건 만든다. 코드 충돌 시 재시도.
--
-- 내부 전용인 이유: 인자로 학생을 지정하므로 그대로 노출하면 아무나 남의
-- 코드를 갈아치울 수 있다. 회원 대상 재발급은 auth.uid()로 본인을 판정하는
-- reissue_link_code RPC로 따로 낸다(커밋 6). 이 함수는 그 RPC와
-- complete_signup_profile(커밋 5)이 내부에서만 호출한다.
-- 두 호출자 모두 security definer라 소유자 권한으로 실행되므로,
-- authenticated에 execute를 주지 않아도 정상 동작한다.
-- ---------------------------------------------------------------------
create or replace function public.issue_student_link_code(p_student_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  c_max_attempt constant int := 10;
  v_code       text;
  v_attempt    int := 0;
  v_constraint text;
begin
  if p_student_id is null then
    raise exception 'student_id_required';
  end if;

  -- 이력 보존: 삭제가 아니라 비활성화. 학생당 활성 1건 인덱스를 위해 선행한다.
  update public.student_link_codes
  set is_active = false,
      deactivated_at = now()
  where student_id = p_student_id
    and is_active;

  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_link_code_string();

    begin
      insert into public.student_link_codes (student_id, code)
      values (p_student_id, v_code);

      return v_code;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

      -- 같은 학생에 대해 발급이 동시에 들어온 경우(재발급 버튼 연타 등).
      -- 재시도해도 계속 막히므로 즉시 구분되는 예외로 던진다.
      if v_constraint = 'student_link_codes_active_student_key' then
        raise exception 'link_code_issue_conflict';
      end if;

      -- 그 외(코드 충돌)는 새 코드로 재시도.
      if v_attempt >= c_max_attempt then
        raise exception 'link_code_generation_failed';
      end if;
    end;
  end loop;
end;
$function$;

-- 내부 전용 함수 — 클라이언트(anon/authenticated) 직접 호출을 차단한다.
--
-- 주의: `revoke ... from public`만으로는 뚫린 채로 남는다. Supabase는 public
-- 스키마의 함수에 anon/authenticated EXECUTE를 기본 부여하는데, 그건 PUBLIC
-- 의사롤이 아니라 각 롤에 직접 걸린 권한이라 PUBLIC 회수로는 사라지지 않는다.
-- 두 롤을 명시적으로 회수해야 한다. (검증: 아래 [4-e])
revoke all on function public.generate_link_code_string()
  from public, anon, authenticated;
revoke all on function public.issue_student_link_code(uuid)
  from public, anon, authenticated;

grant execute on function public.issue_student_link_code(uuid) to service_role;


-- =====================================================================
-- [5] parent_child_links : 학부모-자녀 연결
--
-- 2026-07-31 미팅 확정:
--   - 학부모가 코드를 입력해 요청하면 pending. 학생이 마이페이지에서
--     승인해야 approved가 된다. 즉시 연결이 아니다.
--   - 카디널리티: 학부모 1명 : 자녀 N명, 자녀 1명 : 학부모 1명.
--     즉 한 학부모는 여러 자녀를 관리하지만, 한 학생에게 연결된 학부모는
--     한 명뿐이다. (2026-08-05 확인 — 그 전 기록의 "학생 1 : 학부모 N"은 오기)
--
-- 상태 4종:
--   pending   요청됨, 학생 응답 대기
--   approved  학생이 승인 (실제 연결)
--   rejected  학생이 거절
--   revoked   연결 해제 (승인 후 해제 또는 학부모의 요청 철회)
--
-- rejected/revoked 행은 지우지 않고 쌓는다. 이력이 남아야 "거절 후 재요청"
-- 반복을 나중에 제한할 수 있고, 분쟁 시 근거가 된다.
--
-- 아직 기획 미확정이라 DB로 강제하지 않은 것들 (커밋 6 RPC나 추후 처리):
--   - 거절 후 재요청 횟수/쿨타임 제한
--   - 코드 재발급 시 pending 요청을 함께 정리할지
--     (승인된 연결은 유지로 잠정 결정. link_code_id가 남아 있어서 나중에
--      "구 코드로 들어온 pending"만 골라내는 게 가능하다.)
--
-- parent_id가 실제로 학부모 회원인지는 check로 강제할 수 없다(교차 테이블).
-- 커밋 6의 request_parent_link RPC에서 member_type을 검증한다.
-- =====================================================================

create table if not exists public.parent_child_links (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references auth.users(id) on delete cascade,
  student_id   uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected', 'revoked')),
  -- 어떤 코드로 요청됐는지 (감사·재발급 처리 판단용). 코드 행은 삭제되지 않고
  -- is_active=false로 남으므로 실제로 null이 되는 경우는 거의 없다.
  link_code_id uuid references public.student_link_codes(id) on delete set null,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,                    -- 학생이 승인/거절한 시각
  revoked_at   timestamptz,
  revoked_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint parent_child_links_not_self check (parent_id <> student_id)
);

-- 같은 (학부모, 학생) 쌍에 대해 "살아있는" 연결은 1건만 존재한다.
-- pending과 approved를 한 인덱스로 묶는 이유:
--   - pending 중복 → 학부모가 같은 요청을 계속 밀어넣어 학생 알림을 도배하는 걸 막는다
--   - 이미 approved인데 새 pending → 무의미한 재요청을 막는다
-- rejected/revoked는 제외되므로, 거절·해제된 뒤에는 다시 요청할 수 있다.
create unique index if not exists parent_child_links_open_pair_key
  on public.parent_child_links (parent_id, student_id)
  where status in ('pending', 'approved');

-- 자녀 1명 : 학부모 1명 — 학생당 승인된 연결은 전역에서 1건뿐이다.
--
-- 'approved'만 대상으로 하고 pending은 뺐다. pending까지 묶으면 엉뚱한
-- 학부모가 코드를 잘못 입력해 요청을 걸어둔 것만으로 진짜 학부모가 요청
-- 자체를 못 하는 잠금 상태가 된다. 여러 학부모가 요청을 넣는 것은 허용하되
-- 학생이 승인할 수 있는 건 한 명뿐이고, 두 번째 승인은 이 인덱스가 막는다.
--
-- 커밋 6 respond_parent_link에서 처리할 것:
--   - 이미 승인된 학부모가 있으면 student_already_linked 예외
--   - 승인 시 같은 학생의 다른 pending 요청은 함께 rejected 처리
create unique index if not exists parent_child_links_approved_student_key
  on public.parent_child_links (student_id)
  where status = 'approved';

-- 학생 마이페이지: 나에게 온 대기/승인 목록
create index if not exists parent_child_links_student_idx
  on public.parent_child_links (student_id, status, requested_at desc);

-- 학부모 화면: 내 자녀 목록
create index if not exists parent_child_links_parent_idx
  on public.parent_child_links (parent_id, status, requested_at desc);

alter table public.parent_child_links enable row level security;

-- 양방향 select: 학부모도 학생도 자기가 당사자인 연결을 볼 수 있어야 한다.
-- (학부모는 자녀 목록, 학생은 승인 대기 목록)
-- write 정책은 두지 않는다 — 요청/승인/거절/해제는 전부 커밋 6의
-- security definer RPC 경유. 클라이언트가 status를 직접 approved로
-- 바꿀 수 있으면 학생 승인 절차 자체가 무의미해진다.
drop policy if exists "parent_child_links party read" on public.parent_child_links;
create policy "parent_child_links party read" on public.parent_child_links
  for select using (
    parent_id = auth.uid()
    or student_id = auth.uid()
    or public.is_winning_admin()
  );


-- =====================================================================
-- [6] phone_verifications : 휴대폰 인증코드 (서버 전용)
--
-- 이메일 인증은 Supabase Auth email OTP를 그대로 쓰므로 테이블이 필요 없다.
-- 휴대폰만 알림톡(알리고)이라 자체 구현이다.
--
-- 이 테이블은 클라이언트가 절대 건드리면 안 된다:
--   - RLS를 켜고 정책을 하나도 만들지 않는다 → 정책 없는 RLS는 전면 거부다.
--   - 추가로 anon/authenticated의 테이블 권한 자체를 회수한다. Supabase가
--     public 스키마 테이블에 기본 부여를 하기 때문에, RLS만 믿지 않고
--     권한도 같이 막는 이중 방어다([4-e]에서 함수로 같은 함정을 겪었다).
--   - 접근은 service_role(= api/send-phone-code.js)뿐이다.
--
-- 평문 코드를 저장하지 않는 것만으로는 부족하다. 6자리 숫자는 경우의 수가
-- 100만뿐이라 단순 SHA-256은 DB만 새어도 즉시 역산된다. 그래서 서버가
-- 가진 비밀키(PHONE_CODE_SECRET, Vercel env)로 HMAC을 걸어 저장한다.
-- 키는 DB에 두지 않는다 — DB 덤프만으로는 복원할 수 없어야 하므로.
--   code_hash = hex(hmac_sha256(phone || ':' || code, PHONE_CODE_SECRET))
--
-- 무차별 대입 방어는 해시가 아니라 attempt_count가 담당한다. 코드 자체가
-- 6자리라 시도 횟수를 막지 않으면 해시를 어떻게 걸든 의미가 없다.
-- =====================================================================

create table if not exists public.phone_verifications (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null,                  -- 숫자만 정규화해 저장 (하이픈 없음)
  code_hash     text not null,                  -- 평문 코드는 저장하지 않는다
  purpose       text not null default 'signup'
                check (purpose in ('signup', 'parent_signup', 'phone_change')),
  -- 가입 전 인증이라 대부분 null. 로그인 상태에서의 번호 변경만 값이 있다.
  user_id       uuid references auth.users(id) on delete cascade,
  attempt_count int not null default 0,         -- 검증 시도 횟수 (무차별 대입 차단)
  verified_at   timestamptz,                    -- 검증 성공 시각
  consumed_at   timestamptz,                    -- 가입 완료에 실제로 사용된 시각 (재사용 방지)
  expires_at    timestamptz not null,
  request_ip    inet,                           -- 전화번호 우회 도배 차단용
  created_at    timestamptz not null default now(),
  constraint phone_verifications_phone_format check (phone ~ '^[0-9]{9,11}$'),
  constraint phone_verifications_attempt_range check (attempt_count >= 0)
);

-- 발송 쿨타임(60초)·시간당 5회·일 10회 판정과, 검증 시 "가장 최근 유효 코드"
-- 조회가 전부 이 인덱스를 탄다.
create index if not exists phone_verifications_phone_idx
  on public.phone_verifications (phone, created_at desc);

-- 전화번호를 바꿔가며 도배하는 경우를 IP 기준으로 잡기 위한 보조 인덱스.
create index if not exists phone_verifications_ip_idx
  on public.phone_verifications (request_ip, created_at desc)
  where request_ip is not null;

-- 만료 레코드 정리(배치)용.
create index if not exists phone_verifications_expires_idx
  on public.phone_verifications (expires_at);

alter table public.phone_verifications enable row level security;

-- 정책을 의도적으로 하나도 만들지 않는다.
-- RLS가 켜져 있고 정책이 없으면 service_role을 제외한 모든 접근이 거부된다.
-- 혹시 나중에 누가 "조회가 안 되는데요" 하고 정책을 추가하지 않도록 남긴다:
-- 인증코드는 발급한 서버만 알아야 하고, 본인조차 조회할 이유가 없다.

-- 이중 방어: 테이블 권한 자체를 회수한다(Supabase 기본 부여 무력화).
revoke all on table public.phone_verifications from anon, authenticated;


-- =====================================================================
-- [7] complete_signup_profile 확장
--
-- 원본: 00_base_schema.sql:1099. 바뀌는 점 5가지.
--
-- 1) school_type 필수를 student일 때만으로 분기
--    원본은 전 회원에게 school_type을 요구한다(00_base_schema.sql:1147).
--    학부모·멘토에게는 재학 구분이 없으므로 이 검증 하나 때문에 두 유형은
--    가입 자체가 불가능했다. 이 커밋의 핵심 목적이다.
--
-- 2) member_type 3종 검증
--    원본은 빈 문자열만 막아서 아무 문자열이나 통과했다. [1]에서 profiles에
--    check를 걸었으므로 그대로 두면 23514가 그대로 프론트에 노출된다.
--    프론트가 매칭할 수 있는 invalid_member_type 예외로 바꿔 던진다.
--
-- 3) p_identity_required_agreed 추가 (프론트가 남긴 GAP)
--    "본인 인증을 위한 정보 수집" 필수 동의가 클라이언트에서만 검증되고
--    서버로 전달될 자리가 없었다(StudentForm.jsx TODO). student에게만 필수다
--    — 학부모 약관 목록에는 이 항목이 없다(ParentForm.jsx:37-39).
--
-- 4) student면 연결코드 1건 발급
--    이미 활성 코드가 있으면 새로 만들지 않는다. 이 함수는 프로필 수정 성격의
--    재호출이 가능한데, 그때마다 코드가 바뀌면 "자동 회전 없음" 확정과
--    어긋나고 학부모가 받아둔 코드가 조용히 죽는다.
--
-- 5) 약관 동의를 user_term_agreements에 버전 단위로 기록
--    profiles의 불리언 컬럼은 "지금 동의 상태"만 알 뿐 어느 버전에 동의했는지
--    모른다. 기존 컬럼도 계속 채우지만(읽는 코드가 있다), 이력의 정본은
--    user_term_agreements다. 그래서 identity 동의는 profiles에 컬럼을 새로
--    만들지 않았다 — 레거시 중복을 하나 더 늘리지 않기 위해서다.
--
-- 시그니처가 바뀌므로 구 13인자 함수를 반드시 drop한다. 남겨두면 오버로드가
-- 되어 PostgREST 호출이 모호해지고, 프론트가 계속 구 함수를 불러 약관 이력이
-- 기록되지 않는다. 호출부(StudentForm.jsx)를 같은 커밋에서 함께 고친다.
-- =====================================================================

drop function if exists public.complete_signup_profile(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean
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
  p_ads_agreed                boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id     uuid;
  v_name        text;
  v_username    text;
  v_phone       text;
  v_email       text;
  v_region      text;
  v_school_type text;
  v_school_name text;
  v_member_type text;
  v_link_code   text;
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

  if v_name = '' then
    raise exception 'name_required';
  end if;

  if v_email = '' then
    raise exception 'email_required';
  end if;

  if v_username = '' then
    v_username := v_email;
  end if;

  if v_region = '' then
    raise exception 'region_required';
  end if;

  if v_member_type = '' then
    raise exception 'member_type_required';
  end if;

  if v_member_type not in ('student', 'parent', 'mentor') then
    raise exception 'invalid_member_type';
  end if;

  -- 재학 구분은 학생에게만 필수. 학부모·멘토는 이 값을 가지지 않는다.
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

  if exists (
    select 1
    from public.profiles
    where lower(trim(email)) = v_email
      and id <> v_user_id
  ) then
    raise exception 'duplicate_email';
  end if;

  insert into public.profiles (
    id, name, username, phone, email, region,
    school_type, school_name, member_type, role,
    terms_service_agreed, privacy_required_agreed, privacy_optional_agreed,
    marketing_agreed, ads_agreed, updated_at
  )
  values (
    v_user_id, v_name, v_username, v_phone, v_email, v_region,
    nullif(v_school_type, ''), nullif(v_school_name, ''), v_member_type, 'user',
    coalesce(p_terms_service_agreed, false),
    coalesce(p_privacy_required_agreed, false),
    coalesce(p_privacy_optional_agreed, false),
    coalesce(p_marketing_agreed, false),
    coalesce(p_ads_agreed, false),
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
    updated_at              = now();

  -- 약관 동의 이력 (버전 단위).
  -- 회원유형에 해당하는 활성 약관 + 전체 공통 약관을 대상으로 한다.
  -- 멘토는 아직 약관 행이 없어 아무것도 기록되지 않는다 — 멘토 약관 화면·본문이
  -- 만들어지면 [2] 시드에 추가하면 이 함수는 그대로 두고 동작한다.
  -- 선택 약관의 '거부'도 false로 남긴다(미응답과 구분해야 분쟁 대응이 된다).
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
    'link_code', v_link_code   -- 학생이 아니면 null
  );
end;
$function$;

-- 가입 완료는 이메일 OTP 검증 직후(=로그인 상태)에 호출된다. anon은 호출할
-- 이유가 없고, 호출해도 not_authenticated로 끝난다 — 아예 막아둔다.
revoke all on function public.complete_signup_profile(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, boolean
) from public, anon;

grant execute on function public.complete_signup_profile(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, boolean
) to authenticated, service_role;


-- =====================================================================
-- [8] 연결 RPC 4종
--
-- 전부 security definer라 RLS를 우회한다. 따라서 각 함수가 auth.uid()로
-- "당사자인지"를 직접 판정해야 한다 — 인자로 받은 id를 그대로 믿지 않는다.
--
-- 예외는 영문 snake_case로 던진다. 프론트가 message 문자열로 매칭한다.
-- 새 예외를 추가하면 기존 예외명의 부분문자열이 되지 않는지 확인할 것
-- (프론트가 includes()로 매칭하므로 'link_not_found'와 'not_found' 같은
--  포함 관계가 생기면 잘못된 분기를 탄다).
-- =====================================================================

-- ---------------------------------------------------------------------
-- request_parent_link(code) : 학부모가 연결코드로 연결을 요청한다
--
-- 승인이 불가능한 상황(학생에게 이미 승인된 학부모가 있음)은 요청 시점에
-- 막는다. 통과시켜봐야 학생이 승인할 수 없는 pending이 쌓일 뿐이다.
-- ---------------------------------------------------------------------
create or replace function public.request_parent_link(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_parent_id  uuid;
  v_code       text;
  v_code_id    uuid;
  v_student_id uuid;
  v_link_id    uuid;
  v_status     text;
begin
  v_parent_id := auth.uid();

  if v_parent_id is null then
    raise exception 'not_authenticated';
  end if;

  -- 회원유형 검증: FK로는 강제할 수 없어 여기서 본다([5] 주석 참고)
  if not exists (
    select 1 from public.profiles
    where id = v_parent_id and member_type = 'parent'
  ) then
    raise exception 'not_a_parent';
  end if;

  -- 학부모가 소문자로 입력해도 받아준다. 코드 자체는 항상 대문자로 저장된다.
  v_code := upper(trim(coalesce(p_code, '')));

  if v_code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' then
    raise exception 'invalid_code_format';
  end if;

  select id, student_id into v_code_id, v_student_id
  from public.student_link_codes
  where code = v_code
    and is_active;

  if v_student_id is null then
    raise exception 'link_code_not_found';
  end if;

  if v_student_id = v_parent_id then
    raise exception 'cannot_link_self';
  end if;

  -- 자녀 1명 : 학부모 1명 — 이미 승인된 학부모가 있으면 요청 자체를 막는다.
  if exists (
    select 1 from public.parent_child_links
    where student_id = v_student_id and status = 'approved'
  ) then
    raise exception 'student_already_linked';
  end if;

  -- 이 학부모와의 기존 요청 상태를 먼저 확인해 23505 대신 구분되는 예외를 던진다.
  select status into v_status
  from public.parent_child_links
  where parent_id = v_parent_id
    and student_id = v_student_id
    and status in ('pending', 'approved');

  if v_status = 'pending' then
    raise exception 'link_already_requested';
  end if;

  insert into public.parent_child_links (parent_id, student_id, link_code_id)
  values (v_parent_id, v_student_id, v_code_id)
  returning id into v_link_id;

  return jsonb_build_object(
    'ok', true,
    'link_id', v_link_id,
    'status', 'pending',
    'student_name', (select name from public.profiles where id = v_student_id)
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- respond_parent_link(link_id, approve) : 학생이 승인 또는 거절한다
--
-- 승인 시 같은 학생에게 온 다른 pending 요청은 함께 거절 처리한다.
-- 자녀 1명 : 학부모 1명이라 어차피 승인될 수 없는 요청이고, 남겨두면
-- 학생 화면에 영원히 처리되지 않는 항목으로 남는다.
-- ---------------------------------------------------------------------
create or replace function public.respond_parent_link(
  p_link_id uuid,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student_id uuid;
  v_status     text;
  v_new_status text;
  v_rejected   int := 0;
begin
  v_student_id := auth.uid();

  if v_student_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_approve is null then
    raise exception 'approve_required';
  end if;

  -- 당사자(학생) 본인의 요청만 응답할 수 있다. 남의 link_id를 넣으면
  -- 조회 자체가 안 되므로 link_not_found로 끝난다.
  select status into v_status
  from public.parent_child_links
  where id = p_link_id
    and student_id = v_student_id;

  if v_status is null then
    raise exception 'link_not_found';
  end if;

  if v_status <> 'pending' then
    raise exception 'link_not_pending';
  end if;

  if p_approve then
    if exists (
      select 1 from public.parent_child_links
      where student_id = v_student_id and status = 'approved'
    ) then
      raise exception 'student_already_linked';
    end if;

    -- 승인될 수 없게 된 나머지 요청을 먼저 정리한다.
    update public.parent_child_links
    set status = 'rejected', responded_at = now()
    where student_id = v_student_id
      and status = 'pending'
      and id <> p_link_id;

    get diagnostics v_rejected = row_count;

    v_new_status := 'approved';
  else
    v_new_status := 'rejected';
  end if;

  update public.parent_child_links
  set status = v_new_status, responded_at = now()
  where id = p_link_id;

  return jsonb_build_object(
    'ok', true,
    'link_id', p_link_id,
    'status', v_new_status,
    'auto_rejected', v_rejected   -- 함께 정리된 다른 요청 수
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- revoke_parent_link(link_id) : 연결 해제 / 요청 철회
--
-- 학생과 학부모 양쪽 모두 호출할 수 있다. 학부모는 자기가 보낸 요청을
-- 철회하는 용도로, 학생은 승인했던 연결을 끊는 용도로 쓴다.
-- 누가 끊었는지는 revoked_by에 남는다.
-- ---------------------------------------------------------------------
create or replace function public.revoke_parent_link(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid;
  v_status text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select status into v_status
  from public.parent_child_links
  where id = p_link_id
    and (student_id = v_uid or parent_id = v_uid);

  if v_status is null then
    raise exception 'link_not_found';
  end if;

  if v_status not in ('pending', 'approved') then
    raise exception 'link_not_active';
  end if;

  update public.parent_child_links
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = v_uid
  where id = p_link_id;

  return jsonb_build_object('ok', true, 'link_id', p_link_id, 'status', 'revoked');
end;
$function$;

-- ---------------------------------------------------------------------
-- reissue_link_code() : 학생이 본인 연결코드를 재발급한다
--
-- 인자를 받지 않는다 — 대상은 항상 auth.uid()다. 내부의
-- issue_student_link_code(uuid)는 학생을 인자로 지정할 수 있어 노출하면
-- 안 되므로([4] 주석), 회원용 입구를 이 함수로 따로 낸다.
--
-- 구 코드로 들어온 pending 요청은 함께 거절 처리한다.
-- 재발급의 의미가 "이전 코드 무효화"인데 그 코드로 들어온 요청이 살아 있으면
-- 무효화가 아니게 된다. 승인된 연결은 그대로 둔다(2026-07-31 잠정 결정).
-- ※ 이 처리는 기획 미확정 항목이다. "pending도 유지"로 정해지면 아래
--   update 블록만 지우면 된다.
-- ---------------------------------------------------------------------
create or replace function public.reissue_link_code()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student_id uuid;
  v_old_code_id uuid;
  v_code       text;
  v_rejected   int := 0;
begin
  v_student_id := auth.uid();

  if v_student_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_student_id and member_type = 'student'
  ) then
    raise exception 'not_a_student';
  end if;

  select id into v_old_code_id
  from public.student_link_codes
  where student_id = v_student_id
    and is_active;

  v_code := public.issue_student_link_code(v_student_id);

  if v_old_code_id is not null then
    update public.parent_child_links
    set status = 'rejected', responded_at = now()
    where student_id = v_student_id
      and status = 'pending'
      and link_code_id = v_old_code_id;

    get diagnostics v_rejected = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'link_code', v_code,
    'rejected_pending', v_rejected
  );
end;
$function$;

-- 4종 모두 회원이 직접 호출한다 — authenticated에 execute가 있어야 한다.
-- (anon은 auth.uid()가 null이라 not_authenticated로 끝나지만 아예 막는다)
revoke all on function public.request_parent_link(text)          from public, anon;
revoke all on function public.respond_parent_link(uuid, boolean)  from public, anon;
revoke all on function public.revoke_parent_link(uuid)            from public, anon;
revoke all on function public.reissue_link_code()                 from public, anon;

grant execute on function public.request_parent_link(text)         to authenticated, service_role;
grant execute on function public.respond_parent_link(uuid, boolean) to authenticated, service_role;
grant execute on function public.revoke_parent_link(uuid)          to authenticated, service_role;
grant execute on function public.reissue_link_code()               to authenticated, service_role;


-- =====================================================================
-- [9] check_email_signup_state : 가입 중단 계정 이어가기 판정
--
-- 문제
--   가입 시퀀스는 이메일 인증을 위해 auth.signUp()을 먼저 호출한다. 그래서
--   약관까지 입력하고 "가입 완료"를 누르지 않은 채 이탈하면 auth.users에는
--   행이 남고 profiles는 비어 있는 상태가 된다.
--   그런데 is_email_available(00_base_schema.sql:1280)은 profiles와 auth.users를
--   OR로 묶어 판정하므로 이 상태를 "중복"으로 보고 로그인하라고 안내한다.
--   사용자는 가입도 못 하고 쓸 수 있는 계정도 없는 막다른 길에 갇힌다.
--
-- 왜 "계정 생성을 미루기"로 풀지 않는가
--   Supabase Auth는 이메일 OTP를 보내려면 auth.users 행이 먼저 있어야 한다.
--   계정 없이 이메일만 검증하는 경로가 없다. 그걸 피하려면 이메일 인증을
--   자체 구현(테이블 + 자체 SMTP)해야 하는데 발송 신뢰성까지 떠안게 된다.
--   그래서 "생성을 막기"가 아니라 "이어서 가입하기"로 푼다.
--
-- 반환값 4종. 이어가기를 둘로 쪼갠 이유는 재발송 API가 다르기 때문이다.
--   'available'             아무 데도 없음
--                           → auth.signUp() / verifyOtp type 'signup'
--   'resumable_unverified'  계정 있음, 이메일 미인증 (코드 입력 전 이탈)
--                           → auth.signUp() 재호출이 확인메일을 재발송한다
--   'resumable_verified'    계정 있음, 이메일 인증됨 (가입 완료 직전 이탈)
--                           → signUp은 "이미 등록됨"으로 막히므로
--                             signInWithOtp({shouldCreateUser:false}) / type 'email'
--   'taken'                 가입 완료됨 → 로그인 안내
--
-- ※ signInWithOtp는 "Confirm signup"이 아니라 **Magic Link 템플릿**으로 나간다.
--   그 템플릿도 {{ .Token }}을 쓰도록 고쳐두지 않으면 이어가기 경로에서만
--   다시 매직링크가 발송된다.
--
-- 가입 완료 판정은 member_type이 채워졌는지로 한다. profiles 행 자체는
-- handle_new_user 트리거가 auth.signUp 시점에 미리 만들어버리므로 행의
-- 존재만으로는 완료 여부를 알 수 없다. member_type은 complete_signup_profile만
-- 채운다([7]).
--
-- 주의: 이 함수는 "이 이메일이 가입돼 있는가"를 로그인 전에 알려주므로
-- 계정 존재 여부가 노출된다. 다만 기존 is_email_available도 동일하게
-- 노출하고 있고, 가입 화면의 중복확인 UI 자체가 그걸 전제로 한다.
-- =====================================================================

create or replace function public.check_email_signup_state(p_email text)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_email     text;
  v_auth_id   uuid;
  v_confirmed timestamptz;
  v_completed boolean;
begin
  v_email := lower(trim(coalesce(p_email, '')));

  if v_email = '' then
    return 'available';
  end if;

  select u.id, u.email_confirmed_at
    into v_auth_id, v_confirmed
  from auth.users u
  where lower(trim(u.email)) = v_email
  limit 1;

  -- 계정이 없어도 profiles에 같은 이메일이 있으면 가입된 것으로 본다
  -- (계정이 지워졌는데 프로필만 남은 비정상 상태 방어).
  select exists (
    select 1
    from public.profiles p
    where lower(trim(p.email)) = v_email
      and p.member_type is not null
  ) into v_completed;

  if v_completed then
    return 'taken';
  end if;

  if v_auth_id is not null then
    if v_confirmed is null then
      return 'resumable_unverified';
    end if;
    return 'resumable_verified';
  end if;

  return 'available';
end;
$function$;

-- 가입 화면은 로그인 전(anon)에 호출한다.
revoke all on function public.check_email_signup_state(text) from public;
grant execute on function public.check_email_signup_state(text)
  to anon, authenticated, service_role;


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- -- [1] 회원유형 분포 + 제약 존재 확인
-- select coalesce(member_type, '(null)') as member_type, count(*)
-- from public.profiles group by 1 order by 2 desc;
--
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint where conrelid = 'public.profiles'::regclass
--   and conname = 'profiles_member_type_check';
--
-- -- 제약이 실제로 막는지 (반드시 23514 에러가 나야 정상)
-- -- update public.profiles set member_type = 'teacher' where id = (select id from public.profiles limit 1);
--
-- -- [2] 약관 8건 + 활성 유니크 인덱스 확인
-- select code, version, audience, is_required, profile_column, route
-- from public.terms where is_active order by audience, sort_order;
--
-- -- 같은 code로 활성 버전 2건이 안 되는지 (반드시 23505 에러가 나야 정상)
-- -- insert into public.terms (code, version, audience, title, is_required)
-- -- values ('student_service', 'v2-test', 'student', '중복 테스트', true);
--
-- -- [3] 동의 이력 테이블 RLS: insert 정책이 없어 클라이언트 쓰기가 막히는지
-- select tablename, policyname, cmd
-- from pg_policies where tablename in ('terms', 'user_term_agreements')
-- order by tablename, policyname;
--
-- -- [4-a] 코드 형식: 20건 뽑아 전부 6자 / 허용 알파벳인지
-- select c,
--        c ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' as format_ok
-- from (select public.generate_link_code_string() as c
--       from generate_series(1, 20)) t;
--
-- -- [4-b] 글자 편향: 10000건 * 6자 = 60000글자를 뽑아 31종이 고르게 나오는지.
-- -- 기대 평균 약 1935회. 특정 글자만 25% 이상 튀면 편향 제거가 깨진 것.
-- -- 제외 글자(0,1,I,L,O)가 단 한 건도 없어야 한다.
-- select ch, count(*) as n
-- from (
--   select substr(public.generate_link_code_string(), i, 1) as ch
--   from generate_series(1, 10000), generate_series(1, 6) as g(i)
-- ) t
-- group by ch order by n;
--
-- -- [4-c] 발급/재발급 (dev에서만 — 실제 행이 생긴다)
-- -- 학생 계정 하나를 골라 두 번 발급하면 활성 1건 + 비활성 1건이 돼야 한다.
-- -- select id, email from public.profiles where member_type = 'student' limit 5;
-- -- select public.issue_student_link_code('<student uuid>');
-- -- select public.issue_student_link_code('<student uuid>');
-- -- select code, is_active, issued_at, deactivated_at
-- -- from public.student_link_codes
-- -- where student_id = '<student uuid>' order by issued_at desc;
--
-- -- [4-d] 중복 방어 (반드시 23505가 나야 정상)
-- -- 활성 행을 그대로 복제 시도 — 코드 유일·학생당 1건 인덱스 양쪽에 걸린다.
-- -- insert into public.student_link_codes (student_id, code)
-- -- select student_id, code from public.student_link_codes where is_active limit 1;
-- --
-- -- 형식 제약도 확인 (반드시 23514가 나야 정상 — 소문자 + 5자리)
-- -- 활성 코드가 없는 계정을 골라야 학생당 1건 인덱스(23505)에 먼저 안 걸린다.
-- -- insert into public.student_link_codes (student_id, code)
-- -- select p.id, 'abc12' from public.profiles p
-- -- where not exists (select 1 from public.student_link_codes s
-- --                   where s.student_id = p.id and s.is_active)
-- -- limit 1;
--
-- -- [4-e] 내부 전용 함수가 클라이언트에 노출되지 않았는지
-- -- anon/authenticated는 반드시 can_execute = false 여야 한다.
-- -- (service_role은 issue_student_link_code만 true, generate 쪽은 false여도 무방)
-- select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
-- from pg_proc p
-- cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('generate_link_code_string', 'issue_student_link_code')
-- order by p.proname, r.rolname;
--
-- -- [5-a] 연결 테이블 인덱스·제약 확인
-- select indexname, indexdef from pg_indexes
-- where tablename = 'parent_child_links' order by indexname;
--
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.parent_child_links'::regclass order by conname;
--
-- -- [5-a2] 계정 현황 진단 (이 파일의 검증 대상은 아니고 dev 상태 확인용)
-- --
-- -- auth.users > profiles 인 것 자체는 정상일 수 있다. 가입을 끝까지 마치지
-- -- 않은 계정(=complete_signup_profile 미호출)이 그렇다. 가입 완료 RPC가
-- -- insert ... on conflict (id) do update(00_base_schema.sql:1208)라서
-- -- profiles 행이 없어도 그 시점에 스스로 만든다.
-- select
--   (select count(*) from auth.users)      as auth_users,
--   (select count(*) from public.profiles) as profiles;
--
-- -- profiles가 없는 계정 목록
-- select u.id, u.email, u.created_at
-- from auth.users u
-- where not exists (select 1 from public.profiles p where p.id = u.id)
-- order by u.created_at;
--
-- -- 다만 handle_new_user 트리거(00_base_schema.sql:1548)가 dev에 실제로
-- -- 붙어 있는지는 확인해둘 것. 없으면 가입 완료 전까지 profiles 행이 아예
-- -- 없어서 Header/MyPage의 프로필 조회가 빈 값으로 돈다.
-- -- 행이 1건 나와야 정상이다.
-- select t.tgname, c.relname as on_table, p.proname as calls
-- from pg_trigger t
-- join pg_class c on c.oid = t.tgrelid
-- join pg_proc  p on p.oid = t.tgfoid
-- where not t.tgisinternal
--   and p.proname = 'handle_new_user';
--
-- -- [5-b] 상태 전이 시나리오 일괄 검증
-- -- 에러 없이 끝나면 통과. 실패 지점은 '실패: ...' 예외 메시지로 나온다.
-- -- (검증용 행은 블록 끝에서 스스로 지운다. 시작 시 해당 쌍에 기존 행이
-- --  있으면 실데이터 훼손을 피하려고 아무것도 안 하고 중단한다.)
-- do $$
-- declare
--   v_ids      uuid[];
--   v_parent_a uuid;
--   v_parent_b uuid;
--   v_student  uuid;
--   v_id_a     uuid;
--   v_id_b     uuid;
-- begin
--   -- FK가 auth.users를 참조하므로 계정도 거기서 고른다. profiles는 가입을
--   -- 끝까지 마치지 않은 계정이 빠져 있을 수 있어 기준으로 쓰면 안 된다.
--   select array_agg(id order by created_at) into v_ids
--   from (select id, created_at from auth.users order by created_at limit 3) t;
--
--   if coalesce(array_length(v_ids, 1), 0) < 3 then
--     raise exception '검증 중단: auth.users에 계정이 3건 이상 필요합니다 (현재 %건).',
--       coalesce(array_length(v_ids, 1), 0);
--   end if;
--
--   v_parent_a := v_ids[1];
--   v_parent_b := v_ids[2];
--   v_student  := v_ids[3];
--
--   if exists (
--     select 1 from public.parent_child_links where student_id = v_student
--   ) then
--     raise exception '검증 중단: 선택된 학생에게 이미 연결 행이 있습니다.';
--   end if;
--
--   -- 1) 최초 요청은 pending으로 생성된다
--   insert into public.parent_child_links (parent_id, student_id)
--   values (v_parent_a, v_student) returning id into v_id_a;
--
--   -- 2) 같은 학부모의 pending 중복 요청은 거부된다 (알림 도배 방지)
--   begin
--     insert into public.parent_child_links (parent_id, student_id)
--     values (v_parent_a, v_student);
--     raise exception '실패: pending 중복이 허용됐습니다.';
--   exception when unique_violation then null;
--   end;
--
--   -- 3) 다른 학부모의 pending 요청은 허용된다 (코드 오입력 잠금 방지)
--   insert into public.parent_child_links (parent_id, student_id)
--   values (v_parent_b, v_student) returning id into v_id_b;
--
--   -- 4) 승인은 학생당 1건뿐 — A 승인 후 B 승인은 거부된다 (핵심 규칙)
--   update public.parent_child_links
--   set status = 'approved', responded_at = now() where id = v_id_a;
--   begin
--     update public.parent_child_links
--     set status = 'approved', responded_at = now() where id = v_id_b;
--     raise exception '실패: 한 학생에게 학부모 2명이 승인됐습니다.';
--   exception when unique_violation then null;
--   end;
--
--   -- 5) 이미 approved인데 같은 학부모가 새로 요청하는 것도 거부된다
--   begin
--     insert into public.parent_child_links (parent_id, student_id)
--     values (v_parent_a, v_student);
--     raise exception '실패: approved 상태에서 새 요청이 허용됐습니다.';
--   exception when unique_violation then null;
--   end;
--
--   -- 6) 연결이 해제되면 다른 학부모가 승인될 수 있다
--   update public.parent_child_links
--   set status = 'revoked', revoked_at = now() where id = v_id_a;
--   update public.parent_child_links
--   set status = 'approved', responded_at = now() where id = v_id_b;
--
--   -- 7) 자기 자신과의 연결은 거부된다
--   begin
--     insert into public.parent_child_links (parent_id, student_id)
--     values (v_parent_a, v_parent_a);
--     raise exception '실패: 자기 자신 연결이 허용됐습니다.';
--   exception when check_violation then null;
--   end;
--
--   delete from public.parent_child_links where student_id = v_student;
--
--   raise notice '[5] 전체 통과';
-- end $$;
--
-- -- [5-c] 양방향 select RLS + write 정책 부재 확인
-- -- parent_child_links 행은 SELECT 하나만 나와야 한다.
-- select tablename, policyname, cmd from pg_policies
-- where tablename in ('student_link_codes', 'parent_child_links')
-- order by tablename, policyname;
--
-- -- [6-a] RLS는 켜져 있고 정책은 0건이어야 한다 (= 전면 거부)
-- select c.relname, c.relrowsecurity as rls_enabled,
--        (select count(*) from pg_policies p
--          where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
-- from pg_class c
-- where c.oid = 'public.phone_verifications'::regclass;
--
-- -- [6-b] anon/authenticated는 테이블 권한 자체가 없어야 한다
-- -- (RLS 전면 거부 + 권한 회수 이중 방어. service_role만 true)
-- select r.rolname,
--        has_table_privilege(r.rolname, 'public.phone_verifications', 'select') as can_select,
--        has_table_privilege(r.rolname, 'public.phone_verifications', 'insert') as can_insert
-- from (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
-- order by r.rolname;
--
-- -- [6-c] 전화번호 형식 제약 (반드시 23514가 나야 정상 — 하이픈 포함)
-- -- insert into public.phone_verifications (phone, code_hash, expires_at)
-- -- values ('010-1234-5678', 'x', now() + interval '3 minutes');
--
-- -- 숫자만이면 통과해야 한다 (확인 후 지운다)
-- -- insert into public.phone_verifications (phone, code_hash, expires_at)
-- -- values ('01012345678', 'dummy', now() + interval '3 minutes');
-- -- delete from public.phone_verifications where code_hash = 'dummy';
--
-- -- [7-a] 구 13인자 함수가 남아 있지 않은지 — 반드시 1행(14인자)만 나와야 한다.
-- -- 2행이 나오면 오버로드 상태이고, PostgREST 호출이 모호해지거나 프론트가
-- -- 계속 구 함수를 불러 약관 이력이 기록되지 않는다.
-- select p.oid::regprocedure as signature,
--        pg_get_function_arguments(p.oid) as args
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname = 'complete_signup_profile';
--
-- -- [7-b] 호출 권한: authenticated true / anon false
-- select r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
-- from pg_proc p
-- cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname = 'complete_signup_profile'
-- order by r.rolname;
--
-- -- [7-c] 학부모 가입이 실제로 뚫리는지 (이 커밋의 핵심 확인)
-- --
-- -- auth.uid()가 필요하므로 JWT 클레임을 흉내낸다. 전체가 begin/rollback으로
-- -- 감싸여 있어 아무 행도 남지 않는다. <uuid>는 auth.users의 실제 계정으로
-- -- 바꿔 넣을 것: select id, email from auth.users order by created_at;
-- --
-- -- 기대: school_type을 null로 줘도 에러 없이 ok=true가 나온다.
-- -- (수정 전 함수라면 여기서 school_type_required로 죽는다)
-- --
-- -- begin;
-- -- set local request.jwt.claims = '{"sub":"<uuid>"}';
-- --
-- -- select public.complete_signup_profile(
-- --   '테스트학부모', null, '01000000000', 'parent-test@example.com', '서울',
-- --   null, null, 'parent',
-- --   true,   -- terms_service
-- --   true,   -- privacy_required
-- --   false,  -- identity        (학부모에겐 필수 아님)
-- --   false,  -- privacy_optional
-- --   false,  -- marketing
-- --   false   -- ads
-- -- );
-- --
-- -- -- 약관 이력이 학부모 3종으로 기록됐는지 (student 약관은 섞이면 안 된다)
-- -- select t.code, t.version, a.agreed
-- -- from public.user_term_agreements a
-- -- join public.terms t on t.id = a.term_id
-- -- where a.user_id = '<uuid>'
-- -- order by t.code;
-- --
-- -- rollback;
--
-- -- [7-d] 학생 가입: 연결코드 발급 + 재호출해도 회전하지 않는지
-- --        거부 케이스(identity 미동의 / 잘못된 회원유형)까지 한 번에 확인한다.
-- --
-- -- uuid 수동 치환이 필요 없다 — set_config로 세션에 sub를 심고 auth.uid()를
-- -- 그대로 쓴다. 전체가 begin/rollback 안이라 아무 행도 남지 않는다.
-- -- 에러 없이 끝나면 통과. 실패는 '실패: ...' 메시지로 나온다.
--
-- begin;
--
-- select set_config(
--   'request.jwt.claims',
--   json_build_object('sub', (select id from auth.users order by created_at limit 1))::text,
--   true
-- );
--
-- do $$
-- declare
--   v_first  text;
--   v_second text;
-- begin
--   -- 1) 학생 가입 → 연결코드가 발급돼야 한다
--   v_first := (public.complete_signup_profile(
--     '테스트학생', null, '01000000001', 'student-test@example.com', '서울',
--     '고등학교', '테스트고', 'student',
--     true, true, true, false, false, false
--   )) ->> 'link_code';
--
--   if v_first is null then
--     raise exception '실패: 학생인데 link_code가 발급되지 않았습니다.';
--   end if;
--
--   if v_first !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' then
--     raise exception '실패: link_code 형식이 어긋납니다 (%).', v_first;
--   end if;
--
--   -- 2) 같은 인자로 재호출 → 코드가 그대로여야 한다 (자동 회전 없음)
--   v_second := (public.complete_signup_profile(
--     '테스트학생', null, '01000000001', 'student-test@example.com', '서울',
--     '고등학교', '테스트고', 'student',
--     true, true, true, false, false, false
--   )) ->> 'link_code';
--
--   if v_first is distinct from v_second then
--     raise exception '실패: 재호출로 코드가 회전했습니다 (% -> %).', v_first, v_second;
--   end if;
--
--   -- 3) 학생인데 identity 미동의 → identity_required
--   begin
--     perform public.complete_signup_profile(
--       '테스트학생', null, '01000000001', 'student-test@example.com', '서울',
--       '고등학교', '테스트고', 'student',
--       true, true, false, false, false, false
--     );
--     raise exception '실패: identity 미동의가 통과했습니다.';
--   exception when sqlstate 'P0001' then
--     if sqlerrm <> 'identity_required' then raise; end if;
--   end;
--
--   -- 4) 학생인데 school_type 없음 → school_type_required (학생에겐 여전히 필수)
--   begin
--     perform public.complete_signup_profile(
--       '테스트학생', null, '01000000001', 'student-test@example.com', '서울',
--       null, null, 'student',
--       true, true, true, false, false, false
--     );
--     raise exception '실패: 학생인데 school_type 없이 통과했습니다.';
--   exception when sqlstate 'P0001' then
--     if sqlerrm <> 'school_type_required' then raise; end if;
--   end;
--
--   -- 5) 구 표기 'teacher' → invalid_member_type
--   begin
--     perform public.complete_signup_profile(
--       '테스트', null, '01000000002', 'x-test@example.com', '서울',
--       null, null, 'teacher',
--       true, true, false, false, false, false
--     );
--     raise exception '실패: teacher가 통과했습니다.';
--   exception when sqlstate 'P0001' then
--     if sqlerrm <> 'invalid_member_type' then raise; end if;
--   end;
--
--   raise notice '[7] 전체 통과 (link_code=%)', v_first;
-- end $$;
--
-- rollback;
--
-- -- [8-a] 연결 RPC 4종 권한: authenticated true / anon false
-- select p.proname, r.rolname,
--        has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
-- from pg_proc p
-- cross join (values ('anon'), ('authenticated')) as r(rolname)
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('request_parent_link', 'respond_parent_link',
--                     'revoke_parent_link', 'reissue_link_code')
-- order by p.proname, r.rolname;
--
-- -- [8-b] 연결 플로우 전체 시나리오 (이 커밋의 인수 테스트)
-- --
-- -- set_config로 호출자를 바꿔가며 학부모A/학부모B/학생을 연기한다.
-- -- 전체가 begin/rollback 안이라 profiles 변경까지 포함해 아무것도 남지 않는다.
-- -- 에러 없이 끝나면 통과. 실패는 '실패: ...' 메시지로 나온다.
--
-- begin;
--
-- do $$
-- declare
--   v_ids     uuid[];
--   v_pa      uuid;   -- 학부모 A
--   v_pb      uuid;   -- 학부모 B
--   v_st      uuid;   -- 학생
--   v_code    text;
--   v_code2   text;
--   v_link_a  uuid;
--   v_link_b  uuid;
--   v_res     jsonb;
--   v_status  text;
-- begin
--   select array_agg(id order by created_at) into v_ids
--   from (select id, created_at from auth.users order by created_at limit 3) t;
--
--   if coalesce(array_length(v_ids, 1), 0) < 3 then
--     raise exception '검증 중단: auth.users에 계정이 3건 이상 필요합니다.';
--   end if;
--
--   v_pa := v_ids[1]; v_pb := v_ids[2]; v_st := v_ids[3];
--
--   insert into public.profiles (id, member_type, name) values
--     (v_pa, 'parent',  '학부모A'),
--     (v_pb, 'parent',  '학부모B'),
--     (v_st, 'student', '학생')
--   on conflict (id) do update
--   set member_type = excluded.member_type, name = excluded.name;
--
--   delete from public.parent_child_links where student_id = v_st;
--   update public.student_link_codes set is_active = false where student_id = v_st;
--   v_code := public.issue_student_link_code(v_st);
--
--   -- 1) 학부모 A가 요청 → pending
--   perform set_config('request.jwt.claims', json_build_object('sub', v_pa)::text, true);
--   v_res := public.request_parent_link(lower(v_code));   -- 소문자 입력도 받아야 한다
--   v_link_a := (v_res ->> 'link_id')::uuid;
--   if v_res ->> 'status' <> 'pending' then
--     raise exception '실패: 최초 요청이 pending이 아닙니다 (%).', v_res;
--   end if;
--
--   -- 2) 같은 학부모의 중복 요청 → link_already_requested
--   begin
--     perform public.request_parent_link(v_code);
--     raise exception '실패: 중복 요청이 통과했습니다.';
--   exception when sqlstate 'P0001' then
--     if sqlerrm <> 'link_already_requested' then raise; end if;
--   end;
--
--   -- 3) 다른 학부모 B의 요청은 허용된다
--   perform set_config('request.jwt.claims', json_build_object('sub', v_pb)::text, true);
--   v_link_b := (public.request_parent_link(v_code) ->> 'link_id')::uuid;
--
--   -- 4) 학생이 A를 승인 → B의 pending이 함께 거절돼야 한다
--   perform set_config('request.jwt.claims', json_build_object('sub', v_st)::text, true);
--   v_res := public.respond_parent_link(v_link_a, true);
--   if (v_res ->> 'auto_rejected')::int <> 1 then
--     raise exception '실패: 다른 pending이 자동 거절되지 않았습니다 (%).', v_res;
--   end if;
--
--   select status into v_status from public.parent_child_links where id = v_link_b;
--   if v_status <> 'rejected' then
--     raise exception '실패: B의 상태가 rejected가 아닙니다 (%).', v_status;
--   end if;
--
--   -- 5) 이미 연결된 학생에게 B가 다시 요청 → student_already_linked
--   perform set_config('request.jwt.claims', json_build_object('sub', v_pb)::text, true);
--   begin
--     perform public.request_parent_link(v_code);
--     raise exception '실패: 이미 연결된 학생에게 요청이 통과했습니다.';
--   exception when sqlstate 'P0001' then
--     if sqlerrm <> 'student_already_linked' then raise; end if;
--   end;
--
--   -- 6) 학생이 연결 해제 → 이후 B의 재요청이 가능해야 한다
--   perform set_config('request.jwt.claims', json_build_object('sub', v_st)::text, true);
--   perform public.revoke_parent_link(v_link_a);
--
--   perform set_config('request.jwt.claims', json_build_object('sub', v_pb)::text, true);
--   v_link_b := (public.request_parent_link(v_code) ->> 'link_id')::uuid;
--
--   -- 7) 학생이 코드 재발급 → 코드가 바뀌고, 구 코드로 온 pending이 거절된다
--   perform set_config('request.jwt.claims', json_build_object('sub', v_st)::text, true);
--   v_res := public.reissue_link_code();
--   v_code2 := v_res ->> 'link_code';
--
--   if v_code2 = v_code then
--     raise exception '실패: 재발급했는데 코드가 그대로입니다 (%).', v_code2;
--   end if;
--
--   if (v_res ->> 'rejected_pending')::int <> 1 then
--     raise exception '실패: 구 코드의 pending이 정리되지 않았습니다 (%).', v_res;
--   end if;
--
--   -- 8) 구 코드는 더 이상 통하지 않는다
--   perform set_config('request.jwt.claims', json_build_object('sub', v_pb)::text, true);
--   begin
--     perform public.request_parent_link(v_code);
--     raise exception '실패: 폐기된 코드가 아직 통합니다.';
--   exception when sqlstate 'P0001' then
--     if sqlerrm <> 'link_code_not_found' then raise; end if;
--   end;
--
--   -- 9) 형식 오류 / 학생이 학부모 RPC 호출
--   begin
--     perform public.request_parent_link('abc');
--     raise exception '실패: 잘못된 형식이 통과했습니다.';
--   exception when sqlstate 'P0001' then
--     if sqlerrm <> 'invalid_code_format' then raise; end if;
--   end;
--
--   perform set_config('request.jwt.claims', json_build_object('sub', v_st)::text, true);
--   begin
--     perform public.request_parent_link(v_code2);
--     raise exception '실패: 학생이 학부모용 RPC를 호출했는데 통과했습니다.';
--   exception when sqlstate 'P0001' then
--     if sqlerrm <> 'not_a_parent' then raise; end if;
--   end;
--
--   -- 10) 남의 요청에 응답 시도 → link_not_found (당사자 판정)
--   perform set_config('request.jwt.claims', json_build_object('sub', v_pa)::text, true);
--   begin
--     perform public.respond_parent_link(v_link_b, true);
--     raise exception '실패: 당사자가 아닌데 응답이 통과했습니다.';
--   exception when sqlstate 'P0001' then
--     if sqlerrm <> 'link_not_found' then raise; end if;
--   end;
--
--   raise notice '[8] 전체 통과 (old=%, new=%)', v_code, v_code2;
-- end $$;
--
-- rollback;
--
-- -- [9-a] 실제 계정들이 각각 어떤 상태로 판정되는지
-- -- 가입을 마친 계정은 taken, 이메일 인증만 하고 이탈한 계정은
-- -- resumable_verified, 코드 입력 전 이탈은 resumable_unverified가 나와야 한다.
-- select
--   u.email,
--   u.email_confirmed_at is not null as email_confirmed,
--   p.member_type,
--   public.check_email_signup_state(u.email) as state
-- from auth.users u
-- left join public.profiles p on p.id = u.id
-- order by u.created_at;
--
-- -- 없는 이메일은 available
-- select public.check_email_signup_state('nobody-' || gen_random_uuid() || '@example.com');
--
-- -- [9-b] anon이 호출할 수 있어야 한다 (가입 화면은 로그인 전이다)
-- select r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
-- from pg_proc p
-- cross join (values ('anon'), ('authenticated')) as r(rolname)
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname = 'check_email_signup_state'
-- order by r.rolname;
--
-- -- [4-e'] 위가 true로 나오면 실제 부여 주체를 여기서 확인한다.
-- -- proacl에 anon=X/... 또는 authenticated=X/... 항목이 남아 있으면
-- -- revoke 대상에서 빠진 것이다(PUBLIC 회수만으로는 안 지워진다).
-- select p.proname, coalesce(p.proacl::text, '(기본값 상속)') as proacl
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('generate_link_code_string', 'issue_student_link_code')
-- order by p.proname;
