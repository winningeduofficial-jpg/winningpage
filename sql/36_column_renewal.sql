-- =====================================================================
-- 교육칼럼(galleries) 리뉴얼 — 스키마 확장 (docs/edu-column-renewal-spec.md WP3)
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 포함:
--   1) galleries에 category / view_count / published_at / is_featured 컬럼 추가
--   2) 기존 행의 published_at 백필 (created_at 기준)
--   3) 목록/필터/피처드 조회용 인덱스 3종
--
-- 주의:
--   - 프론트(src/pages/column/columnData.js)는 이 마이그레이션 적용 전에도
--     select('*') + 클라이언트 파생/fallback으로 무결하게 동작한다
--     (category 없음→'전체' 취급, view_count 없음→조회수 미노출,
--     published_at 없음→created_at 사용, is_featured 없음→최신 4건).
--     따라서 이 SQL의 적용 시점은 프론트 배포와 무관하다.
--   - category 값은 src/pages/column/columnData.js의 COLUMN_CATEGORIES 7종과
--     Admin.jsx galleries.fields의 category select options가 자 단위로 일치해야 한다
--     ('대학 입시 제로'·'학생부•수행평가•세특'(U+2022) 포함, 임의 수정 금지).
-- =====================================================================

alter table public.galleries
  add column if not exists category      text,
  add column if not exists view_count    integer     not null default 0,
  add column if not exists published_at  timestamptz,
  add column if not exists is_featured   boolean     not null default false;

update public.galleries
set published_at = created_at
where published_at is null;

create index if not exists idx_galleries_active_published
  on public.galleries (is_active, published_at desc);

create index if not exists idx_galleries_category
  on public.galleries (category)
  where category is not null;

create index if not exists idx_galleries_featured
  on public.galleries (is_featured)
  where is_featured;
