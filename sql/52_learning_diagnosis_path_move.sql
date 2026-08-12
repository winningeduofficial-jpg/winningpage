-- =====================================================================
-- 학습진단 URL 6종 통일 규칙 이관: 소개(마케팅) 페이지 경로를
-- '/learning-diagnosis' → '/services/learning-diagnosis'로 갱신한다.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 배경: 43_learning_diagnosis_rename.sql이 '무료진단'(라벨/링크 모두 free-diagnosis)을
-- '학습진단'(라벨 학습진단 / 링크 /learning-diagnosis)으로 개명했다. 이번 파일은 그
-- 후속으로, 확정된 6종 URL 통일 규칙(소개 페이지 = /services/{slug}, 앱 = /app/{slug}/...)에
-- 맞춰 링크 값만 한 번 더 옮긴다. 라벨('학습진단')은 이미 정본이라 이번엔 건드리지 않는다.
--
-- 실행 대상: dev/운영 공용으로 작성했다. dev는 43이 이미 적용돼 값이 '/learning-diagnosis'다.
-- 운영은 43을 개별 적용하지 않고 dev 덤프 재이관을 기다리는 중이라(43번 파일 헤더 참고),
-- 이 시점 값이 여전히 '/free-diagnosis'일 수 있다. 이 파일은 **두 값을 모두** where에 넣어
-- 어느 쪽 DB에 실행해도 '/services/learning-diagnosis'로 수렴하도록 했다 — 즉 운영처럼
-- 43이 미적용인 DB에서는 '/free-diagnosis' → '/services/learning-diagnosis' 1문장으로 2단계
-- 이관(무료진단→학습진단, 구 경로→신 경로)을 한 번에 흡수한다.
--
-- 갱신 대상 3테이블(43번과 동일 3테이블, 이번엔 경로 컬럼만):
--   1) program_categories.link  — 대상 1행 추정 (43번 실측 기준)
--   2) page_contents.slug       — 대상 1행 추정
--   3) banners.button_link      — 대상 최대 3행 추정 (43번 실측 기준. 운영 실 행수는 다를 수 있다)
--
-- 설문 경로(앱, /app/learning-diagnosis/survey)는 이 파일에 없다 — sql/ 전체를 확인한 결과
-- (00/10/20/30/34/43 등) 어느 시드·마이그레이션도 설문 경로를 DB 컬럼에 저장하지 않는다.
-- 헤더/푸터/랜딩 카드가 참조하는 page_contents.slug·program_categories.link·
-- banners.button_link는 전부 "소개 페이지"(랜딩) 목적지만 가리키고, 설문 페이지로의 이동은
-- 프런트 코드(LearningDiagnosisLanding.jsx의 <Link to="/app/learning-diagnosis/survey">)가
-- 하드코딩한다. 따라서 DB에 갱신할 설문 경로 행이 없다.
--
-- ⚠️ page_contents.slug 위험도 점검 — DynamicPage(`/page/:slug`) 라우팅 영향 없음:
--   src/hooks/useNavGroups.js의 resolveMenuLink()는 slug가 '/'로 시작하면 그 값을 **그대로**
--   내비게이션 링크(to)로 쓰고, 그렇지 않은 값만 `/page/${slug}`로 감싸 DynamicPage가 소비하는
--   라우트를 만든다. 이 테이블의 학습진단 행은 slug 자체가 절대경로('/free-diagnosis' 또는
--   '/learning-diagnosis')로 저장돼 있어 처음부터 `/page/:slug` 매칭 대상이 아니었다(같은
--   패턴이 slug='/faq' 행에도 이미 존재 — sql/34_menu_navigation_sync.sql:63 참고). 따라서 이
--   슬러그를 '/services/learning-diagnosis'로 바꿔도 DynamicPage(`src/pages/DynamicPage.jsx`)나
--   `/page/:slug` 라우트에는 아무 영향이 없다 — 이 행은 애초에 그 경로로 들어간 적이 없다.
--
-- 멱등 보장:
--   - 값 UPDATE는 where 절이 **구 값('/free-diagnosis' 또는 '/learning-diagnosis')에만**
--     매칭되고 신 값('/services/learning-diagnosis')과는 매칭되지 않으므로, 재실행 시 이미
--     갱신된 행은 자연히 스킵된다(no-op).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) program_categories — link 컬럼만 갱신 (name '학습진단'은 43에서 이미 정본)
-- ---------------------------------------------------------------------
update public.program_categories
set link = '/services/learning-diagnosis'
where btrim(link) in ('/free-diagnosis', '/learning-diagnosis');

-- ---------------------------------------------------------------------
-- 2) page_contents — slug 컬럼만 갱신 (menu_label/title '학습진단'은 43에서 이미 정본)
--    위 헤더 코멘트 참고 — 이 슬러그는 /page/:slug(DynamicPage) 대상이 아니라
--    헤더/푸터가 직접 소비하는 절대경로 링크다.
-- ---------------------------------------------------------------------
update public.page_contents
set slug = '/services/learning-diagnosis'
where btrim(slug) in ('/free-diagnosis', '/learning-diagnosis');

-- ---------------------------------------------------------------------
-- 3) banners — button_link 컬럼 갱신 (최대 3행 추정)
-- ---------------------------------------------------------------------
update public.banners
set button_link = '/services/learning-diagnosis'
where btrim(button_link) in ('/free-diagnosis', '/learning-diagnosis');

commit;


-- =====================================================================
-- schema_migrations 마커
-- 43번과 동일하게 "대상이 실제로 그 상태일 때만 기록" 패턴을 따른다 — 3테이블 모두 구
-- 값('/free-diagnosis'·'/learning-diagnosis')이 하나도 남지 않았을 때만 마커를 남긴다.
-- =====================================================================

-- 20_landing_renewal.sql / 43_learning_diagnosis_rename.sql 과 동일 정의
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

insert into public.schema_migrations (version)
select '52_learning_diagnosis_path_move_v1'
where not exists (
    select 1 from public.program_categories
    where btrim(link) in ('/free-diagnosis', '/learning-diagnosis')
  )
  and not exists (
    select 1 from public.page_contents
    where btrim(slug) in ('/free-diagnosis', '/learning-diagnosis')
  )
  and not exists (
    select 1 from public.banners
    where btrim(button_link) in ('/free-diagnosis', '/learning-diagnosis')
  )
  and not exists (
    select 1 from public.schema_migrations
    where version = '52_learning_diagnosis_path_move_v1'
  );


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================

-- 1) 구 값 잔존 — 결과 0행이어야 한다
-- select 'program_categories' as tbl, id, link as value from public.program_categories
--  where btrim(link) in ('/free-diagnosis', '/learning-diagnosis')
-- union all
-- select 'page_contents', id, slug from public.page_contents
--  where btrim(slug) in ('/free-diagnosis', '/learning-diagnosis')
-- union all
-- select 'banners', id, button_link from public.banners
--  where btrim(button_link) in ('/free-diagnosis', '/learning-diagnosis');

-- 2) 신 값 행수 — program_categories 1 / page_contents 1 / banners 최대 3 (실 운영 행수는 다를 수 있음)
-- select 'program_categories' as tbl, count(*) from public.program_categories
--  where link = '/services/learning-diagnosis'
-- union all
-- select 'page_contents', count(*) from public.page_contents
--  where slug = '/services/learning-diagnosis'
-- union all
-- select 'banners', count(*) from public.banners
--  where button_link = '/services/learning-diagnosis';

-- 3) 마커 — 1행이어야 한다
-- select version, applied_at from public.schema_migrations
--  where version = '52_learning_diagnosis_path_move_v1';


-- =====================================================================
-- 롤백 SQL (주석 — 실행되지 않는다. 되돌려야 할 때만 수동으로 해제해 사용)
--
-- 주의: 롤백은 신 경로('/services/learning-diagnosis')를 43 적용 이후 형태인
-- '/learning-diagnosis'로만 되돌린다. 이 파일 실행 전 값이 '/free-diagnosis'였던 행(43
-- 미적용 DB)은 롤백해도 '/free-diagnosis'로는 돌아가지 않는다 — 그 상태까지 되돌리려면
-- 43번 파일의 롤백 절도 함께 실행해야 한다. 또 프런트엔드 코드가 이미 신 경로를 쓰고
-- 있다면 롤백 후 반드시 코드도 함께 되돌려야 한다.
-- =====================================================================
--
-- begin;
--   update public.banners set button_link = '/learning-diagnosis'
--    where btrim(button_link) = '/services/learning-diagnosis';
--   update public.page_contents set slug = '/learning-diagnosis'
--    where btrim(slug) = '/services/learning-diagnosis';
--   update public.program_categories set link = '/learning-diagnosis'
--    where btrim(link) = '/services/learning-diagnosis';
-- commit;
--
-- delete from public.schema_migrations where version = '52_learning_diagnosis_path_move_v1';
-- =====================================================================
