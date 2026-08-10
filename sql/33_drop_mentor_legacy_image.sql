-- =====================================================================
-- 멘토 성공전략 구버전 통이미지 컬럼 완전 제거 (home_mentor_strategies.image_url)
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 주의: DROP COLUMN은 되돌릴 수 없다(irreversible). 운영 DB 이행 전 반드시
--       백업 스냅샷(Supabase Dashboard → Database → Backups 또는 pg_dump)을
--       먼저 확보한 뒤 실행할 것.
-- =====================================================================

alter table public.home_mentor_strategies drop column if exists image_url;
