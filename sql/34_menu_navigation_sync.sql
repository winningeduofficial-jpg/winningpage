-- =====================================================================
-- 헤더/푸터 공용 메뉴(page_contents) 트리를 Figma 시안(2016:1796)과 동기화
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 실행 대상: dev(qxrqwbfjwthwaapikacu)에 먼저 적용해 화면 확인 후, 운영 DB는
--           이행 단계에서 별도로 동일 파일을 재실행한다.
--
-- 포함:
--   1) menu_label 변경 8건 — 시안 문구에 맞춰 정정
--   2) 서비스 그룹 메뉴 노출 제외 2건 — 페이지 자체는 유지하되
--      menu_group/menu_group_order를 null로 비워 헤더/푸터 메뉴에서만 숨김
--   3) 서비스 그룹 sort_order 재정렬 — 학습진단을 그룹 선두로,
--      신규 '자기평가' 항목 자리를 포함해 시안 순서대로 재배열
--   4) 신규 row 삽입 — services-self-assessment('자기평가')
--
-- 멱등 보장:
--   - update 문은 전부 where ... is distinct from '<신규값>' 가드를 걸어,
--     이미 원하는 값이면 재실행 시 no-op이다(불필요한 updated_at 갱신 방지).
--   - insert는 on conflict (slug) do nothing으로 재실행 안전.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) menu_label 변경
-- ---------------------------------------------------------------------
update public.page_contents
set menu_label = '목표관리'
where slug = 'services-goal'
  and menu_label is distinct from '목표관리';

update public.page_contents
set menu_label = '콜멘토'
where slug = 'services-content'
  and menu_label is distinct from '콜멘토';

update public.page_contents
set menu_label = '수행평가'
where slug = 'services-ai-performance'
  and menu_label is distinct from '수행평가';

update public.page_contents
set menu_label = '심화탐구'
where slug = 'services-in-depth-research'
  and menu_label is distinct from '심화탐구';

update public.page_contents
set menu_label = '특목고입학 프로그램'
where slug = 'premium-special-highschool'
  and menu_label is distinct from '특목고입학 프로그램';

-- 가운데점은 U+30FB('・') — 일반 가운뎃점(U+00B7 '·')과 혼동 주의
update public.page_contents
set menu_label = '국제・해외고 국내대 입학컨설팅'
where slug = 'premium-returning-student'
  and menu_label is distinct from '국제・해외고 국내대 입학컨설팅';

update public.page_contents
set menu_label = '회사소개'
where slug = 'company-intro'
  and menu_label is distinct from '회사소개';

update public.page_contents
set menu_label = '자주하는 질문'
where slug = '/faq'
  and menu_label is distinct from '자주하는 질문';

-- ---------------------------------------------------------------------
-- 2) 서비스 그룹 메뉴 제외 (페이지는 유지, 헤더/푸터 노출만 제거)
--    menu_group은 NOT NULL(default ''::text)이라 null을 넣을 수 없다 —
--    빈 문자열로 비운다. 공용 훅(useNavGroups.js)이 menu_group이 빈 row는
--    skip하므로 헤더/푸터 메뉴에는 노출되지 않는다. menu_group_order는
--    그룹 소속이 아니게 되어 무의미해지지만 기존 값은 그대로 보존한다.
-- ---------------------------------------------------------------------
update public.page_contents
set menu_group = ''
where slug in ('services-susi-prediction', 'services-record-coach')
  and menu_group is distinct from '';

-- ---------------------------------------------------------------------
-- 3) 서비스 그룹 sort_order 재정렬 (시안 순서)
--    1 학습진단 / 2 목표관리 / 3 콜멘토 / 4 수행평가 / 5 자기평가(신규) / 6 심화탐구
-- ---------------------------------------------------------------------
update public.page_contents
set sort_order = 1
-- 34는 43(무료진단→학습진단 rename)보다 먼저 실행된다. slug가 아직 구 값
-- ('/free-diagnosis')인 DB에서도 매칭되도록 구·신 slug를 모두 넣는다.
where slug in ('/learning-diagnosis', '/free-diagnosis')
  and sort_order is distinct from 1;

update public.page_contents
set sort_order = 2
where slug = 'services-goal'
  and sort_order is distinct from 2;

update public.page_contents
set sort_order = 3
where slug = 'services-content'
  and sort_order is distinct from 3;

update public.page_contents
set sort_order = 4
where slug = 'services-ai-performance'
  and sort_order is distinct from 4;

update public.page_contents
set sort_order = 6
where slug = 'services-in-depth-research'
  and sort_order is distinct from 6;

-- ---------------------------------------------------------------------
-- 4) 신규 row: 자기평가 (services-self-assessment)
-- ---------------------------------------------------------------------
insert into public.page_contents (
  menu_group, menu_label, slug, title, sort_order, menu_group_order, is_active
)
values (
  '서비스', '자기평가', 'services-self-assessment', '자기평가', 5, 1, true
)
on conflict (slug) do nothing;

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select menu_group, sort_order, menu_label, slug
-- from public.page_contents
-- where menu_group is not null
-- order by menu_group, menu_group_order, sort_order;
