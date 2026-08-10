-- =====================================================================
-- 교육칼럼(galleries) 블록 에디터 도입 — content_json 컬럼 추가
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 목적: BlockNote 블록 JSON({v, editor, blocks})을 정본으로 저장.
--   기존 content(text) 컬럼은 삭제하지 않고 평문 미러로 계속 동기 기록한다.
--
-- 36_column_renewal.sql과 독립적으로 실행 가능 (운영 DB에는 36번 미적용 상태).
-- =====================================================================

alter table public.galleries
  add column if not exists content_json jsonb;
