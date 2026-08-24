-- 프리미엄 프로그램 6종 CMS 행 삭제(premium-db-decouple).
--
-- 프리미엄 프로그램 페이지가 전부 코드 페이지로 전환되고(premiumRoutes.tsx), 헤더/푸터
-- '프리미엄' 메뉴 그룹도 DB(page_contents) 소유에서 코드(PREMIUM_NAV_GROUP,
-- src/data/navigation.ts) 소유로 옮겨졌다. 이 6개 행은 이제 어디에서도 조회되지 않는다 —
-- premiumRoutes.tsx의 catch-all(/page/premium/:program → DynamicPage)이 제거되어 CMS
-- 렌더 경로 자체가 소멸했고, useNavGroups.ts도 이 행들의 menu_group/menu_label을 더 이상
-- 읽지 않는다(replacePremiumNavGroup이 DB 파생 '프리미엄' 그룹을 항상 무시하고 교체).
--
-- slug는 각 프로그램의 최신 상태(20260823000005 route_convention 이후) 기준 실측값이다 —
-- admission-consulting/a만 선행 슬래시 절대경로, 나머지 5개는 'premium/<program>' 상대경로.
DELETE FROM public.page_contents
WHERE slug IN (
  '/page/premium/admission-consulting/a',
  'premium/special-highschool',
  'premium/graduate-school',
  'premium/global-university',
  'premium/international-school',
  'premium/returning-student'
);
