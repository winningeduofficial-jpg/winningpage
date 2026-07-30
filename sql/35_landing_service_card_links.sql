-- =====================================================================
-- program_categories(서비스 카드) 링크를 스텁 '/services'에서 실제 목표
-- 페이지 경로로 교체 — sql/20_landing_renewal.sql 시드가 이미 실행된
-- 운영 DB용 (Supabase SQL Editor에서 수동 실행 필요, idempotent).
--
-- 매핑 근거: src/data/navigation.js FALLBACK_NAV_GROUPS 서비스 그룹
--   목표관리 → /page/services-goal
--   콜멘토   → /page/services-content
--   수행평가 → /page/services-ai-performance
--   자기평가 → /page/services-self-assessment
--   심화탐구 → /page/services-in-depth-research
--
-- 카드 식별: name 컬럼(program_categories) 기준. link가 이미 목표값이면
-- is distinct from 가드로 재실행 시 no-op.
-- =====================================================================

update public.program_categories pc
set link = v.link
from (
  values
    ('목표관리', '/page/services-goal'),
    ('콜멘토',   '/page/services-content'),
    ('수행평가', '/page/services-ai-performance'),
    ('자기평가', '/page/services-self-assessment'),
    ('심화탐구', '/page/services-in-depth-research')
) as v(name, link)
where pc.name = v.name
  and pc.link is distinct from v.link;

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select name, link, sort_order
-- from public.program_categories
-- order by sort_order;
