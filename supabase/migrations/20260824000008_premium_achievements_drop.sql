-- premium_achievements 테이블 drop(premium-db-decouple).
--
-- 대입컨설팅 A/S 프로그램 랜딩 '실적으로 증명하는 실력' pill 데이터가 코드 상수
-- (src/components/premium/premiumStaticData.ts의 PREMIUM_ACHIEVEMENTS)로 이관되어 이
-- 테이블을 더 이상 조회하는 코드가 없다(usePremiumAchievements 훅 삭제). 다른 테이블・뷰가
-- 이 테이블을 참조하지 않음을 확인했다(20260823000003 생성 이후 FK/view 없음) — 인덱스 2개・
-- RLS 정책 2개는 테이블과 함께 자동으로 제거되므로 CASCADE는 불필요하다.
DROP TABLE IF EXISTS public.premium_achievements;

-- 어드민 화면(프리미엄 실적 뱃지)도 함께 제거되어(20260823000003이 등록한 admin_resources
-- 행) 권한 화면에 유령 리소스가 남지 않도록 삭제한다.
DELETE FROM public.admin_resources WHERE key = 'premiumAchievements';
