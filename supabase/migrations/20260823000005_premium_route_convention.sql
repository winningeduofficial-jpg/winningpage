-- 프리미엄 라우트 컨벤션 전환: /page/premium-<slug> → /page/premium/<slug>.
--
-- premium-a: 대입컨설팅 A 프로그램은 이제 코드 페이지(AdmissionConsultingA,
-- /page/premium/admission-consulting/a)가 전담한다. 단 헤더/푸터 메뉴는 page_contents
-- 행에서 생성되므로(useNavGroups) 행을 지우면 메뉴에서 사라진다. slug를 선행 슬래시
-- 절대경로로 바꿔 메뉴 항목만 남기고(어드민 안내: /로 시작하면 기능 페이지로 직접 연결),
-- 20260823000003이 꺼둔 is_active를 다시 켠다. 코드 라우트가 catch-all보다 먼저 매칭되므로
-- DynamicPage가 이 행을 렌더할 일은 없다.
UPDATE public.page_contents
SET slug = '/page/premium/admission-consulting/a', is_active = true
WHERE slug = 'premium-a';

-- premium-special-highschool: 특목고입학 프로그램은 반대로 CMS 페이지로 남는다(코드
-- 페이지 없음, DynamicPage가 렌더). DELETE 후 빈 INSERT로 새로 만들면 기존 title/body/
-- image_urls 등 실제 콘텐츠를 잃으므로, UPDATE로 slug만 이동하고 20260823000004가 꺼둔
-- is_active를 다시 켠다(원래 A 프로그램 대체 전까지 활성 CMS 페이지였다).
UPDATE public.page_contents
SET slug = 'premium/special-highschool', is_active = true
WHERE slug = 'premium-special-highschool';

-- 나머지 프리미엄 CMS 페이지(대학원입학·해외명문대·국제학교·국제해외고 편입) 4종도
-- 동일 컨벤션으로 slug만 이동한다. 콘텐츠·is_active는 그대로 유지.
UPDATE public.page_contents SET slug = 'premium/graduate-school'      WHERE slug = 'premium-graduate-school';
UPDATE public.page_contents SET slug = 'premium/global-university'    WHERE slug = 'premium-global-university';
UPDATE public.page_contents SET slug = 'premium/international-school' WHERE slug = 'premium-international-school';
UPDATE public.page_contents SET slug = 'premium/returning-student'    WHERE slug = 'premium-returning-student';
