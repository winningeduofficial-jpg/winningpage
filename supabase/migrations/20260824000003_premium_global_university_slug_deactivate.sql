-- 해외명문대 진학컨설팅(premium/global-university)이 코드 페이지(GlobalUniversityConsulting,
-- /page/premium/global-university)로 전환되어 CMS 행을 비활성화한다. 코드 라우트가
-- catch-all(/page/premium/:program)보다 먼저 매칭되므로 어드민에서 이 행을 편집해도
-- 실제 페이지 렌더에는 반영되지 않는다(20260824000002 premium_graduate_school_slug_deactivate
-- 패턴 답습).
UPDATE public.page_contents
SET is_active = false
WHERE slug = 'premium/global-university';
