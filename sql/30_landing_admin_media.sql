-- =====================================================================
-- 랜딩페이지 이미지 관리자 관리 전환 — 스키마/백필 (계획서 docs/landing-image-admin-plan.md 2절)
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 포함:
--   1) home_mentor_strategies 카드 분해 컬럼 5종 추가
--      (badge / title_lines / photo_url / photo_layout / card_width)
--   2) 멘토 22건 백필 UPDATE — mentor_name + image_url 이중 매칭,
--      마커 '30_mentor_card_fields_backfill_v1' 가드 (최초 1회만)
--   3) banners 히어로 969×429 통이미지 1건 시드 —
--      마커 '30_banners_hero_seed_v1' 가드 (최초 1회만)
--   4) 기존 banners 활성 행(구 1938×858 규격) 정리 — 마커 가드
--   5) 레거시 가로형 멘토 행 비활성화 — 마커 가드
--      (20_landing_renewal.sql의 주석 처리 블록을 dev 선검증·이력 추적 가능한 형태로 SQL화)
--
-- 주의:
--   - photo_url/image_url은 로컬경로(/images/landing/…)로만 시드한다.
--     Storage publicUrl은 환경별로 다르므로 SQL에 절대 URL 금지 —
--     업로드 스크립트(scripts/seed-landing-storage.mjs)가 환경별 URL로 UPDATE한다.
--   - 4)번 블록 실행 전 확인 필요 (아래 해당 섹션 주석 참고):
--     banners 소비처는 src/pages/Home.jsx:159(신규 히어로)뿐이고
--     src/components/HeroSlider.jsx(구 1938×858 규격)는 현재 어디서도 import되지 않음을
--     확인했다. 만약 운영 코드에 구 규격 배너를 계속 노출하는 화면이 남아 있다면
--     이 블록 적용 여부를 재검토할 것.
-- =====================================================================

-- 마커 테이블 (20_landing_renewal.sql과 동일 — 신규/부분 설치 대비 재선언)
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 1) home_mentor_strategies : 카드 분해 컬럼 추가
--    Figma 1982:7301 리뉴얼 카드 = 흰 카드 + 상단 텍스트(badge/title_lines)
--    + 하단 투명 인물사진(photo_url/photo_layout) 합성.
--    image_url(통이미지)은 구버전 rows 폴백용으로 존치.
-- ---------------------------------------------------------------------
alter table public.home_mentor_strategies add column if not exists badge        text;
alter table public.home_mentor_strategies add column if not exists title_lines  jsonb;   -- text 배열 (예: ["강지후 멘토","서울대 동양학과"])
alter table public.home_mentor_strategies add column if not exists photo_url    text;
alter table public.home_mentor_strategies add column if not exists photo_layout jsonb;   -- {top,left,width,height,crop?} — 렌더 px 좌표
alter table public.home_mentor_strategies add column if not exists card_width   int default 210;

-- ---------------------------------------------------------------------
-- 2) 멘토 22건 백필 (src/data/landingPreview.js mentors 픽스처와 동일 값)
--    mentor_name + image_url 이중 매칭 — 관리자가 이미지 교체한 행은 건드리지 않는다.
--    1회성: 마커로 최초 1회만 적용 — 이후 재실행에서는 관리자 수정값 보존.
--    오탈자/표기는 Figma 원문 그대로 유지 (교정 금지, 기존 프로젝트 결정사항):
--    김성훈 "김성훈멘토"(공백 없음), 김무경 "연세대 응용계학과", 이승현 "연세대 신소재 공학과"
-- ---------------------------------------------------------------------
update public.home_mentor_strategies m
set badge        = v.badge,
    title_lines  = v.title_lines::jsonb,
    photo_url    = v.photo_url,
    photo_layout = v.photo_layout::jsonb,
    card_width   = v.card_width
from (
  values
    ('강지후', '/images/landing/mentors/cards/강지후.png', '예체능계열 멘토',   '["강지후 멘토","서울대 동양학과"]',                    '/images/landing/mentors/photos/강지후.png', '{"top":106,"left":0,"width":210,"height":270}', 210),
    ('김형준', '/images/landing/mentors/cards/김형준.png', '위닝 8기',          '["김형준 멘토","서울대 수의예과"]',                    '/images/landing/mentors/photos/김형준.png', '{"top":106,"left":0,"width":210,"height":315}', 210),
    ('박서정', '/images/landing/mentors/cards/박서정.png', '위닝 10기',         '["박서정 멘토","뉴욕대 경제학과"]',                    '/images/landing/mentors/photos/박서정.png', '{"top":106,"left":0,"width":210,"height":289}', 210),
    ('박찬일', '/images/landing/mentors/cards/박찬일.png', '위닝 13기',         '["박찬일 멘토","포항공대 무은재학부"]',                '/images/landing/mentors/photos/박찬일.png', '{"top":106,"left":0,"width":210,"height":270}', 210),
    ('이청훈', '/images/landing/mentors/cards/이청훈.png', '위닝 8기',          '["이청훈 멘토","고려대 신소재공학부"]',                '/images/landing/mentors/photos/이청훈.png', '{"top":106,"left":0,"width":210,"height":270}', 210),
    ('김무경', '/images/landing/mentors/cards/김무경.png', '위닝 8기',          '["김무경 멘토","연세대 응용계학과"]',                  '/images/landing/mentors/photos/김무경.png', '{"top":95,"left":0,"width":230,"height":296}',  230),
    ('하현서', '/images/landing/mentors/cards/하현서.png', '위닝 11기',         '["하현서 멘토","유니스트 디자인학과"]',                '/images/landing/mentors/photos/하현서.png', '{"top":111,"left":0,"width":210,"height":270}', 210),
    ('제민규', '/images/landing/mentors/cards/제민규.png', '위닝 12기',         '["제민규 멘토","서울대 원자핵공학과"]',                '/images/landing/mentors/photos/제민규.png', '{"top":106,"left":0,"width":210,"height":271}', 210),
    ('김단아', '/images/landing/mentors/cards/김단아.png', '학습멘토 위닝 2기', '["김단아 멘토","포항공대 신소재공학과"]',              '/images/landing/mentors/photos/김단아.png', '{"top":106,"left":0,"width":210,"height":315}', 210),
    -- 김성훈: 사진 h(392px)이 카드 h(360px)를 초과 — Figma 원본대로 내부 img 상단 크롭
    ('김성훈', '/images/landing/mentors/cards/김성훈.png', '위닝 9기',          '["김성훈멘토","서울대 수의학과"]',                     '/images/landing/mentors/photos/김성훈.png', '{"top":92,"left":0,"width":210,"height":392,"crop":{"top":"-16.26%","height":"116.12%"}}', 210),
    ('박민정', '/images/landing/mentors/cards/박민정.png', '해외유학 위닝 14기','["박민정 멘토","Syracuse University 법학전공"]',       '/images/landing/mentors/photos/박민정.png', '{"top":100,"left":5,"width":200,"height":280}', 210),
    ('김정윤', '/images/landing/mentors/cards/김정윤.png', '위닝 9기',          '["김정윤 멘토","성균관대 국제통상학과"]',              '/images/landing/mentors/photos/김정윤.png', '{"top":111,"left":0,"width":210,"height":270}', 210),
    ('손주연', '/images/landing/mentors/cards/손주연.png', '위닝 8기',          '["손주연 멘토","한양대 미디어커뮤니케이션"]',          '/images/landing/mentors/photos/손주연.png', '{"top":87,"left":0,"width":210,"height":286}',  210),
    ('신영진', '/images/landing/mentors/cards/신영진.png', '학습 위닝 2기',     '["신영진 멘토","대구한의대 한의예과"]',                '/images/landing/mentors/photos/신영진.png', '{"top":98,"left":17,"width":200,"height":300}', 210),
    ('정재웅', '/images/landing/mentors/cards/정재웅.png', '위닝 13기',         '["정재웅 멘토","홍익대 디자인컨버전스학과"]',          '/images/landing/mentors/photos/정재웅.png', '{"top":109,"left":0,"width":210,"height":271}', 210),
    ('성민우', '/images/landing/mentors/cards/성민우.png', '위닝 14기',         '["성민우 멘토","대구한의대 한의학과"]',                '/images/landing/mentors/photos/성민우.png', '{"top":110,"left":0,"width":210,"height":270}', 210),
    ('최정연', '/images/landing/mentors/cards/최정연.png', '아트멘토 위닝 1기', '["최정연 멘토","서울대 공예과"]',                      '/images/landing/mentors/photos/최정연.png', '{"top":110,"left":0,"width":210,"height":280}', 210),
    ('이승현', '/images/landing/mentors/cards/이승현.png', '학습 위닝 2기',     '["이승현 멘토","연세대 신소재 공학과"]',               '/images/landing/mentors/photos/이승현.png', '{"top":110,"left":0,"width":210,"height":269}', 210),
    ('한정원', '/images/landing/mentors/cards/한정원.png', '학습 위닝 2기',     '["한정원 멘토","카네기 맬런 대학교","전기 및 컴퓨터 공학"]', '/images/landing/mentors/photos/한정원.png', '{"top":110,"left":11,"width":210,"height":254}', 210),
    ('정채윤', '/images/landing/mentors/cards/정채윤.png', '위닝 10기',         '["정채윤 멘토","가천대 한의예과"]',                    '/images/landing/mentors/photos/정채윤.png', '{"top":100,"left":0,"width":210,"height":280}', 210),
    ('함다현', '/images/landing/mentors/cards/함다현.png', '위닝 3기',          '["함다현 멘토","홍익대 회화과"]',                      '/images/landing/mentors/photos/함다현.png', '{"top":100,"left":0,"width":210,"height":264}', 210),
    ('한혜원', '/images/landing/mentors/cards/한혜원.png', '위닝 15기',         '["한혜원 멘토","한양대 자율전공"]',                    '/images/landing/mentors/photos/한혜원.png', '{"top":102,"left":0,"width":200,"height":268}', 210)
) as v(mentor_name, image_url, badge, title_lines, photo_url, photo_layout, card_width)
where m.mentor_name = v.mentor_name
  and m.image_url   = v.image_url
  and not exists (
    select 1 from public.schema_migrations
    where version = '30_mentor_card_fields_backfill_v1'
  );

-- 백필 대상(20번 시드 22건)이 실제로 존재할 때만 마커를 기록한다 —
-- 20번(멘토 시드) 미실행 상태로 30번이 먼저 실행되면 UPDATE 적중 0건인데도
-- 마커만 남아, 이후 20번을 실행해도 백필 기회가 영구 소실되는 것을 방지.
insert into public.schema_migrations (version)
select '30_mentor_card_fields_backfill_v1'
where exists (
  select 1 from public.home_mentor_strategies
  where image_url like '/images/landing/mentors/cards/%'
)
and not exists (
  select 1 from public.schema_migrations
  where version = '30_mentor_card_fields_backfill_v1'
);

-- ---------------------------------------------------------------------
-- 3) banners : 히어로 969×429 통이미지 1건 시드
--    (src/data/landingPreview.js banners 픽스처와 동일 값 — title/highlight/button_text/button_link)
--    마커('30_banners_hero_seed_v1') 가드로 최초 1회만 삽입한다. image_url
--    기준 where-not-exists는 업로드 스크립트가 이 행의 image_url을 Storage URL로
--    교체한 뒤 재실행하면 로컬경로 조건이 다시 뚫려 행이 중복 삽입되므로 사용하지 않는다.
-- ---------------------------------------------------------------------
insert into public.banners (title, highlight, subtitle, image_url, button_text, button_link, sort_order, is_active)
select '메인 배너', null, null, '/images/landing/hero/main-banner-full.png', null, '/learning-diagnosis', 1, true
where not exists (
  select 1 from public.schema_migrations
  where version = '30_banners_hero_seed_v1'
);

insert into public.schema_migrations (version)
select '30_banners_hero_seed_v1'
where not exists (
  select 1 from public.schema_migrations
  where version = '30_banners_hero_seed_v1'
);

-- ---------------------------------------------------------------------
-- 4) 기존 banners 활성 행 정리 (구 1938×858 규격 → 신규 969×429 통이미지 체제)
--    [실행 전 확인 필요]
--    - banners 소비처 전수 확인 결과: src/pages/Home.jsx:159(sort_order asc, is_active=true만)이
--      유일한 실사용처이고, 구 규격용 src/components/HeroSlider.jsx는 import되는 곳이 없다.
--    - 운영 DB에서 실행하기 전, 현재 활성 배너 목록을 눈으로 확인할 것:
--        select id, title, image_url, sort_order, is_active from public.banners order by sort_order;
--      구 규격 배너를 계속 노출해야 하는 사정이 있으면 이 블록만 건너뛴다.
--    1회성: 마커로 최초 1회만 적용 — 이후 재실행에서는 관리자가 조정한
--    노출여부/순서를 그대로 보존한다.
-- ---------------------------------------------------------------------
-- 구 규격 활성 행: 순서를 뒤로 밀고(신규 행 최상위 보장) 비활성화
update public.banners
set sort_order = sort_order + 100,
    is_active  = false
where is_active = true
  and (image_url is null or image_url <> '/images/landing/hero/main-banner-full.png')
  and not exists (
    select 1 from public.schema_migrations
    where version = '30_banners_hero_rows_cleanup_v1'
  );

-- 신규 히어로 행을 sort_order 최상위로 고정
update public.banners
set sort_order = 1
where image_url = '/images/landing/hero/main-banner-full.png'
  and sort_order <> 1
  and not exists (
    select 1 from public.schema_migrations
    where version = '30_banners_hero_rows_cleanup_v1'
  );

insert into public.schema_migrations (version)
select '30_banners_hero_rows_cleanup_v1'
where not exists (
  select 1 from public.schema_migrations
  where version = '30_banners_hero_rows_cleanup_v1'
);

-- ---------------------------------------------------------------------
-- 5) 레거시 가로형 멘토 행 비활성화 (20_landing_renewal.sql의 [선택 실행] 블록 SQL화)
--    리뉴얼 이전 행(1400×500 가로형 전략 이미지)은 신규 세로 카드와 호환되지 않으므로
--    시드 경로 22건 목록에 없는 image_url 행을 노출에서 제외한다.
--    1회성: 마커로 최초 1회만 적용 — 관리자가 이후 업로드하는 통이미지(스토리지 URL)는
--    목록 밖이지만, 마커 가드 덕에 재실행돼도 비활성화되지 않는다.
--    반드시 업로드 스크립트(로컬경로 → 스토리지 URL 교체)보다 먼저 실행할 것 (파일 순서대로).
-- ---------------------------------------------------------------------
update public.home_mentor_strategies
set is_active = false
where (image_url is null
   or image_url not in (
     '/images/landing/mentors/cards/강지후.png','/images/landing/mentors/cards/김형준.png',
     '/images/landing/mentors/cards/박서정.png','/images/landing/mentors/cards/박찬일.png',
     '/images/landing/mentors/cards/이청훈.png','/images/landing/mentors/cards/김무경.png',
     '/images/landing/mentors/cards/하현서.png','/images/landing/mentors/cards/제민규.png',
     '/images/landing/mentors/cards/김단아.png','/images/landing/mentors/cards/김성훈.png',
     '/images/landing/mentors/cards/박민정.png','/images/landing/mentors/cards/김정윤.png',
     '/images/landing/mentors/cards/손주연.png','/images/landing/mentors/cards/신영진.png',
     '/images/landing/mentors/cards/정재웅.png','/images/landing/mentors/cards/성민우.png',
     '/images/landing/mentors/cards/최정연.png','/images/landing/mentors/cards/이승현.png',
     '/images/landing/mentors/cards/한정원.png','/images/landing/mentors/cards/정채윤.png',
     '/images/landing/mentors/cards/함다현.png','/images/landing/mentors/cards/한혜원.png'
   ))
  and not exists (
    select 1 from public.schema_migrations
    where version = '30_legacy_mentor_rows_deactivate_v1'
  );

insert into public.schema_migrations (version)
select '30_legacy_mentor_rows_deactivate_v1'
where not exists (
  select 1 from public.schema_migrations
  where version = '30_legacy_mentor_rows_deactivate_v1'
);
