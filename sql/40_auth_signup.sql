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
--
-- 의존: 00_base_schema.sql (profiles, is_winning_admin())
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
