-- A 프로그램 정적 페이지의 실제 메뉴 자리는 "특목고입학 프로그램"(premium-special-highschool)이다.
-- 20260823000003 에서 premium-a 를 잘못 비활성화했으므로 되돌리고, 코드 페이지가 대체하는
-- premium-special-highschool 행을 대신 비활성화한다(코드 라우트가 catch-all 보다 먼저 매칭).
UPDATE public.page_contents SET is_active = true  WHERE slug = 'premium-a';
UPDATE public.page_contents SET is_active = false WHERE slug = 'premium-special-highschool';
