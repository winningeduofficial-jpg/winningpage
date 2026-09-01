-- 특목고입학 프로그램(premium/special-highschool)이 코드 페이지
-- (SpecialHighschoolAdmission, /page/premium/special-highschool)로 전환되어 CMS 행을
-- 비활성화한다. 20260823000005(premium_route_convention)에서 다시 켰던 이 행을 이번엔
-- 코드 페이지 전환으로 끈다 — 코드 라우트가 catch-all(/page/premium/:program)보다 먼저
-- 매칭되므로 어드민에서 이 행을 편집해도 실제 페이지 렌더에는 반영되지 않는다
-- (premium_graduate_school_slug_deactivate 패턴 답습).
UPDATE public.page_contents
SET is_active = false
WHERE slug = 'premium/special-highschool';
