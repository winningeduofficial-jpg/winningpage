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
-- -- [4-e'] 위가 true로 나오면 실제 부여 주체를 여기서 확인한다.
-- -- proacl에 anon=X/... 또는 authenticated=X/... 항목이 남아 있으면
-- -- revoke 대상에서 빠진 것이다(PUBLIC 회수만으로는 안 지워진다).
-- select p.proname, coalesce(p.proacl::text, '(기본값 상속)') as proacl
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('generate_link_code_string', 'issue_student_link_code')
-- order by p.proname;
