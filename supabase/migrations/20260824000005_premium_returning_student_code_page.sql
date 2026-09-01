-- 국제・해외고 국내대 입학컨설팅(premium/returning-student)이 코드 페이지
-- (ReturningStudentAdmission, /page/premium/returning-student)로 전환되어 CMS 행을
-- 비활성화한다. 코드 라우트가 catch-all(/page/premium/:program)보다 먼저 매칭되므로
-- 어드민에서 이 행을 편집해도 실제 페이지 렌더에는 반영되지 않는다
-- (premium_graduate_school_slug_deactivate 패턴 답습).
--
-- 주의: navigation.ts 기준 이 프로그램의 slug는 returning-student다. 대응되는 Figma
-- 프레임명은 "국제학교 학습관리"였지만, 그건 별도 메뉴 항목(international-school)의
-- 슬러그이자 콘텐츠라 착각하지 않을 것 — 이 페이지(국제・해외고 국내대 입학컨설팅,
-- 해외고 수시·특례·편입 안내)와는 무관하다.
UPDATE public.page_contents
SET is_active = false
WHERE slug = 'premium/returning-student';
