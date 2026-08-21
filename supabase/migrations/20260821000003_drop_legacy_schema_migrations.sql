-- 구 sql/ 넘버링 체계의 수동 적용 마커 테이블 제거.
-- 2026-08-21 스쿼시로 sql/ 폴더가 폐기되고 supabase CLI migrations로 전환됨에 따라
-- 추적은 supabase_migrations.schema_migrations가 전담한다. baseline 덤프에 딸려 온
-- public.schema_migrations는 더 이상 읽는 곳이 없다.

drop table if exists public.schema_migrations;
