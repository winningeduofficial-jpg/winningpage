-- 프리미엄 코드 페이지 전환(20260824000002~5)이 page_contents 행 4개를 is_active=false로
-- 끄면서, 같은 행에서 생성되는 헤더/푸터 '프리미엄' 서브메뉴 항목도 함께 사라졌다
-- (useNavGroups는 is_active=true 행만 읽는다). 그 결과 서브메뉴가 6개 → 2개
-- (대입컨설팅·국제학교 학습관리)로 줄어드는 회귀 발생.
--
-- 20260823000005(premium_route_convention)가 같은 이유로 admission-consulting/a의
-- is_active를 다시 켠 전례를 그대로 따른다: 코드 페이지 라우트(premiumRoutes.tsx)가
-- catch-all(/page/premium/:program → PremiumDynamicPage)보다 먼저 조립되므로, 행을 켜도
-- CMS(DynamicPage) 렌더는 부활하지 않고 메뉴 항목만 복원된다.
UPDATE public.page_contents
SET is_active = true
WHERE slug IN (
  'premium/graduate-school',
  'premium/global-university',
  'premium/special-highschool',
  'premium/returning-student'
);
