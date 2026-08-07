-- =====================================================================
-- 수시정시 합격사례(admission_posts) 블록 에디터 도입 — content_json 컬럼 추가
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 목적: BlockNote 블록 JSON({v, editor, blocks})을 정본으로 저장.
--   기존 content(text) 컬럼은 삭제하지 않고 평문 미러로 계속 동기 기록해
--   렌더러 롤백 시에도 본문이 출력되도록 한다.
-- =====================================================================

alter table public.admission_posts
  add column if not exists content_json jsonb;
