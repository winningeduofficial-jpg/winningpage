-- =====================================================================
-- 위닝에듀 랜딩페이지 리뉴얼 스키마/시드 (명세 5절)
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 포함:
--   1) university_acceptances 신규 테이블 + RLS + 시드 26건 (general 16 + medical_special 10)
--   2) program_categories.icon_image_url 컬럼 추가 + 6건 교체 시드
--   3) home_mentor_strategies 멘토 22건 이미지 시드 (image_url 기준, 통이미지 방식)
--      + 레거시(구 가로형 전략 이미지) 행 비활성화 옵션(주석 처리)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) 공통: is_admin() 헬퍼 + 1회성 마이그레이션 마커
--    profiles 자체 RLS 정책이 "select from profiles where role='admin'" 서브쿼리를
--    재참조하면 42P17 infinite recursion으로 admin 화면의 모든 쓰기가 막힌다.
--    security definer로 profiles 조회를 우회해 재귀를 끊는다.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- 아래 시드 블록 중 "운영 재적용 시 관리자 수정값을 덮어쓰면 안 되는" 부분을
-- 최초 1회만 실행되도록 표시하는 마커 테이블 (idempotent).
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 1) university_acceptances : 메인 '합격생' 섹션 대학 카드
-- ---------------------------------------------------------------------
create table if not exists public.university_acceptances (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                    -- 대학명 (예: 중앙대학교)
  emblem_url  text,                             -- 엠블럼 이미지 (카드에 120x120 표시)
  subtitle    text,                             -- 카드 서브라벨 자유 텍스트 (예: '7명 합격', '의예과')
  count       int,                              -- 합격 인원 (nullable — 일반계열은 count, 특수계열은 subtitle 사용 또는 subtitle 통일. 렌더는 subtitle 우선, 없으면 'N명 합격' 폴백)
  track       text not null default 'general'
              check (track in ('general', 'medical_special')),  -- 일반계열 | 의약학·특수계열
  sort_order  int default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- 기존 설치본 마이그레이션 (idempotent): subtitle 추가 + count nullable 완화
alter table public.university_acceptances add column if not exists subtitle text;
alter table public.university_acceptances alter column count drop not null;
alter table public.university_acceptances alter column count drop default;

alter table public.university_acceptances enable row level security;

-- 공개 read: 활성 항목만 (기존 공개 테이블 패턴과 동일)
drop policy if exists "university_acceptances public read" on public.university_acceptances;
create policy "university_acceptances public read" on public.university_acceptances
  for select using (is_active = true);

-- admin write: public.is_admin() (0번 섹션 참고 — profiles RLS 재귀 방지)
drop policy if exists "university_acceptances admin write" on public.university_acceptances;
create policy "university_acceptances admin write" on public.university_acceptances
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- 시드 general 16건 (Figma 1889:5211 순서, subtitle = 학과명 — 인원수 표기 체계 폐지)
-- 기존 설치본에 구 'N명 합격' 시드(10건)가 있으면 신규 16건과 이름이 겹쳐 중복 노출되므로
-- 먼저 구 시드를 비활성화한다. 삭제가 아니라 is_active=false 처리라 언제든 되돌릴 수 있다.
-- 1회성: 마이그레이션 마커로 최초 1회만 적용 — 이후 재실행에서는 관리자가 조정한
-- 노출여부를 그대로 보존한다(신규 16건을 다시 활성화하지 않음).
update public.university_acceptances
set is_active = false
where track = 'general'
  and subtitle like '%명 합격%'
  and not exists (
    select 1 from public.schema_migrations
    where version = '20_landing_renewal_university_acceptances_general_v2'
  );

insert into public.university_acceptances (name, emblem_url, subtitle, count, track, sort_order)
select v.name, v.emblem_url, v.subtitle, null, 'general', v.sort_order
from (
  values
    ('중앙대학교',   '/images/landing/acceptance/chung-ang.png',      '시스템생명공학', 10),
    ('서울대학교',   '/images/landing/acceptance/seoul-national.png', '원자핵공학',     20),
    ('이화여대',     '/images/landing/acceptance/ewha.png',           '경영학과',       30),
    ('한양대학교',   '/images/landing/acceptance/hanyang.png',        '파이낸스',       40),
    ('포스텍',       '/images/landing/acceptance/postech.png',        '산업경영공학',   50),
    ('고려대학교',   '/images/landing/acceptance/korea.png',          '차세대통신',     60),
    ('연세대학교',   '/images/landing/acceptance/yonsei.png',         '영어영문학과',   70),
    ('성균관대학교', '/images/landing/acceptance/sungkyunkwan.png',   '공학계열',       80),
    ('서강대학교',   '/images/landing/acceptance/sogang.png',         '중국문화',       90),
    ('한양대학교',   '/images/landing/acceptance/hanyang.png',        '국제학부',      100),
    ('연세대학교',   '/images/landing/acceptance/yonsei.png',         '컴퓨터공학',    110),
    ('홍익대학교',   '/images/landing/acceptance/hongik.png',         '미술대학',      120),
    ('서울대학교',   '/images/landing/acceptance/seoul-national.png', '수의학과',      130),
    ('서강대학교',   '/images/landing/acceptance/sogang.png',         '경제학과',      140),
    ('중앙대학교',   '/images/landing/acceptance/chung-ang.png',      '경영학',        150),
    ('경희대학교',   '/images/landing/acceptance/kyunghee.png',       '경영학',        160)
) as v(name, emblem_url, subtitle, sort_order)
where not exists (
  select 1 from public.university_acceptances ua
  where ua.name = v.name and ua.track = 'general' and ua.subtitle = v.subtitle
);

insert into public.schema_migrations (version)
select '20_landing_renewal_university_acceptances_general_v2'
where not exists (
  select 1 from public.schema_migrations
  where version = '20_landing_renewal_university_acceptances_general_v2'
);

-- 시드 medical_special 10건 (시안 1685:1452 순서, subtitle = 학과명 — 결정 15)
-- 엠블럼 일부는 시안 placeholder — 운영에서 관리자 교체 예정
insert into public.university_acceptances (name, emblem_url, subtitle, count, track, sort_order)
select v.name, v.emblem_url, v.subtitle, null, 'medical_special', v.sort_order
from (
  values
    ('고려대학교',       '/images/landing/acceptance/medical/korea-med.png',             '의예과',        10),
    ('한양대학교',       '/images/landing/acceptance/medical/hanyang-med.png',           '의예과',        20),
    ('경북대학교',       '/images/landing/acceptance/medical/kyungpook-med.png',         '의예과',        30),
    ('고신대학교',       '/images/landing/acceptance/medical/kosin-med.png',             '의과대학',      40),
    ('가톨릭관동대학교', '/images/landing/acceptance/medical/catholic-kwandong-med.png', '의과대학',      50),
    ('부산대학교',       '/images/landing/acceptance/medical/pusan-dent.png',            '치의예과',      60),
    ('동의대학교',       '/images/landing/acceptance/medical/dongeui-kmed.png',          '한의예과',      70),
    ('원광대학교',       '/images/landing/acceptance/medical/wonkwang-kmed.png',         '한의예과',      80),
    ('해군사관학교',     '/images/landing/acceptance/medical/naval-academy.png',         '84기',          90),
    ('고려대학교',       '/images/landing/acceptance/medical/korea-samsung.png',         '삼성전자 연계', 100)
) as v(name, emblem_url, subtitle, sort_order)
where not exists (
  select 1 from public.university_acceptances ua
  where ua.name = v.name and ua.track = 'medical_special' and ua.subtitle = v.subtitle
);

-- ---------------------------------------------------------------------
-- 2) program_categories : 카드 일러스트 이미지 컬럼 + 6항목 교체 시드
-- ---------------------------------------------------------------------
alter table public.program_categories add column if not exists icon_image_url text;

-- [교체용] 기존 노출 항목을 신규 6항목으로 전면 교체하려면 아래 주석을 해제해
-- 기존 행을 먼저 비활성화한 뒤 insert를 실행하세요. (upsert 대용 — name 기준)
-- update public.program_categories
--   set is_active = false
--   where name not in ('무료진단', '목표관리', '콜멘토', '수행평가', '자기평가', '심화탐구');

insert into public.program_categories (name, description, link, icon, icon_image_url, sort_order, is_active)
select v.name, v.description, v.link, 'default', v.icon_image_url, v.sort_order, true
from (
  values
    ('무료진단', E'무료로 경험하는\n위닝 AE시스템',        '/free-diagnosis', '/images/landing/services/free-diagnosis.png',         1),
    ('목표관리', E'목표 대학과\n진로에 맞춘 관리 서비스',  '/services',       '/images/landing/services/goal-management.png',        2),
    ('콜멘토',   E'필요한 순간에\n멘토와 바로 연결',       '/services',       '/images/landing/services/call-mentor.png',            3),
    ('수행평가', E'수행평가를\n함께 완성',                 '/services',       '/images/landing/services/performance-assessment.png', 4),
    ('자기평가', E'문항 해석부터\n구조 설계까지',          '/services',       '/images/landing/services/self-assessment.png',        5),
    ('심화탐구', E'주제 추천부터\n탐구 설계까지',          '/services',       '/images/landing/services/deep-inquiry.png',           6)
) as v(name, description, link, icon_image_url, sort_order)
where not exists (
  select 1 from public.program_categories pc where pc.name = v.name
);

-- 동일 name 행이 이미 있는 경우 카피/일러스트/순서를 최신값으로 갱신
-- 1회성: 마이그레이션 마커로 최초 1회만 적용 — 이후 재실행에서는 관리자가
-- 어드민에서 수정한 카피/순서/노출여부를 그대로 보존한다.
update public.program_categories pc
set description    = v.description,
    icon_image_url = v.icon_image_url,
    sort_order     = v.sort_order,
    is_active      = true
from (
  values
    ('무료진단', E'무료로 경험하는\n위닝 AE시스템',        '/images/landing/services/free-diagnosis.png',         1),
    ('목표관리', E'목표 대학과\n진로에 맞춘 관리 서비스',  '/images/landing/services/goal-management.png',        2),
    ('콜멘토',   E'필요한 순간에\n멘토와 바로 연결',       '/images/landing/services/call-mentor.png',            3),
    ('수행평가', E'수행평가를\n함께 완성',                 '/images/landing/services/performance-assessment.png', 4),
    ('자기평가', E'문항 해석부터\n구조 설계까지',          '/images/landing/services/self-assessment.png',        5),
    ('심화탐구', E'주제 추천부터\n탐구 설계까지',          '/images/landing/services/deep-inquiry.png',           6)
) as v(name, description, icon_image_url, sort_order)
where pc.name = v.name
  and not exists (
    select 1 from public.schema_migrations
    where version = '20_landing_renewal_program_categories_backfill_v1'
  );

insert into public.schema_migrations (version)
select '20_landing_renewal_program_categories_backfill_v1'
where not exists (
  select 1 from public.schema_migrations
  where version = '20_landing_renewal_program_categories_backfill_v1'
);

-- ---------------------------------------------------------------------
-- 3) home_mentor_strategies : 멘토 22건 이미지 시드 (통이미지 방식)
-- ---------------------------------------------------------------------
-- Figma 스트립에서 추출한 210×360(김무경만 230×360) 최종 통이미지 22장.
-- mentor_name/title은 home_mentor_strategies가 NOT NULL(기본값 없음)이라
-- Figma 최종 디자인의 실데이터를 그대로 채운다 (image_url 기준 where-not-exists, idempotent).
insert into public.home_mentor_strategies (mentor_name, title, image_url, sort_order, is_active)
select s.mentor_name, s.title, s.image_url, s.sort_order, true
from (
  values
    ('강지후', '강지후 멘토 서울대 동양학과',                          '/images/landing/mentors/cards/강지후.png',  10),
    ('김형준', '김형준 멘토 서울대 수의예과',                          '/images/landing/mentors/cards/김형준.png',  20),
    ('박서정', '박서정 멘토 뉴욕대 경제학과',                          '/images/landing/mentors/cards/박서정.png',  30),
    ('박찬일', '박찬일 멘토 포항공대 무은재학부',                      '/images/landing/mentors/cards/박찬일.png',  40),
    ('이청훈', '이청훈 멘토 고려대 신소재공학부',                      '/images/landing/mentors/cards/이청훈.png',  50),
    ('김무경', '김무경 멘토 연세대 응용계학과',                        '/images/landing/mentors/cards/김무경.png',  60),
    ('하현서', '하현서 멘토 유니스트 디자인학과',                      '/images/landing/mentors/cards/하현서.png',  70),
    ('제민규', '제민규 멘토 서울대 원자핵공학과',                      '/images/landing/mentors/cards/제민규.png',  80),
    ('김단아', '김단아 멘토 포항공대 신소재공학과',                    '/images/landing/mentors/cards/김단아.png',  90),
    ('김성훈', '김성훈멘토 서울대 수의학과',                           '/images/landing/mentors/cards/김성훈.png', 100),
    ('박민정', '박민정 멘토 Syracuse University 법학전공',            '/images/landing/mentors/cards/박민정.png', 110),
    ('김정윤', '김정윤 멘토 성균관대 국제통상학과',                    '/images/landing/mentors/cards/김정윤.png', 120),
    ('손주연', '손주연 멘토 한양대 미디어커뮤니케이션',                '/images/landing/mentors/cards/손주연.png', 130),
    ('신영진', '신영진 멘토 대구한의대 한의예과',                      '/images/landing/mentors/cards/신영진.png', 140),
    ('정재웅', '정재웅 멘토 홍익대 디자인컨버전스학과',                '/images/landing/mentors/cards/정재웅.png', 150),
    ('성민우', '성민우 멘토 대구한의대 한의학과',                      '/images/landing/mentors/cards/성민우.png', 160),
    ('최정연', '최정연 멘토 서울대 공예과',                            '/images/landing/mentors/cards/최정연.png', 170),
    ('이승현', '이승현 멘토 연세대 신소재 공학과',                     '/images/landing/mentors/cards/이승현.png', 180),
    ('한정원', '한정원 멘토 카네기 맬런 대학교 전기 및 컴퓨터 공학',   '/images/landing/mentors/cards/한정원.png', 190),
    ('정채윤', '정채윤 멘토 가천대 한의예과',                          '/images/landing/mentors/cards/정채윤.png', 200),
    ('함다현', '함다현 멘토 홍익대 회화과',                            '/images/landing/mentors/cards/함다현.png', 210),
    ('한혜원', '한혜원 멘토 한양대 자율전공',                          '/images/landing/mentors/cards/한혜원.png', 220)
) as s(mentor_name, title, image_url, sort_order)
where not exists (
  select 1 from public.home_mentor_strategies m where m.image_url = s.image_url
);

-- [선택 실행] 레거시 행 비활성화: 리뉴얼 이전 행(1400×500 가로형 전략 이미지)은
-- 신규 210×360 세로 카드와 호환되지 않으므로, 시드 경로 목록에 없는 image_url 행을
-- 노출에서 제외하려면 아래 주석을 해제해 실행하세요. (idempotent)
-- 주: 관리자에서 새로 업로드한 통이미지(스토리지 URL)도 목록 밖이므로,
--     교체 운영 시작 이후에는 실행하지 마세요.
-- update public.home_mentor_strategies
-- set is_active = false
-- where image_url is null
--    or image_url not in (
--      '/images/landing/mentors/cards/강지후.png','/images/landing/mentors/cards/김형준.png',
--      '/images/landing/mentors/cards/박서정.png','/images/landing/mentors/cards/박찬일.png',
--      '/images/landing/mentors/cards/이청훈.png','/images/landing/mentors/cards/김무경.png',
--      '/images/landing/mentors/cards/하현서.png','/images/landing/mentors/cards/제민규.png',
--      '/images/landing/mentors/cards/김단아.png','/images/landing/mentors/cards/김성훈.png',
--      '/images/landing/mentors/cards/박민정.png','/images/landing/mentors/cards/김정윤.png',
--      '/images/landing/mentors/cards/손주연.png','/images/landing/mentors/cards/신영진.png',
--      '/images/landing/mentors/cards/정재웅.png','/images/landing/mentors/cards/성민우.png',
--      '/images/landing/mentors/cards/최정연.png','/images/landing/mentors/cards/이승현.png',
--      '/images/landing/mentors/cards/한정원.png','/images/landing/mentors/cards/정채윤.png',
--      '/images/landing/mentors/cards/함다현.png','/images/landing/mentors/cards/한혜원.png'
--    );
