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
-- -- [4-e'] 위가 true로 나오면 실제 부여 주체를 여기서 확인한다.
-- -- proacl에 anon=X/... 또는 authenticated=X/... 항목이 남아 있으면
-- -- revoke 대상에서 빠진 것이다(PUBLIC 회수만으로는 안 지워진다).
-- select p.proname, coalesce(p.proacl::text, '(기본값 상속)') as proacl
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('generate_link_code_string', 'issue_student_link_code')
-- order by p.proname;
