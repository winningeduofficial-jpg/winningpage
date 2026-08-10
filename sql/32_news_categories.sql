-- =====================================================================
-- 랜딩 "소식" 섹션 카테고리 배지 — 스키마 확장 + dev 시드 (Figma 1907:14893 재구현)
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 포함:
--   1) company_news / notices에 category 컬럼 추가
--      (nullable text — 값이 없으면 프론트에서 배지 pill 자체를 렌더하지 않는다)
--   2) dev 시드 UPDATE 2건씩 — 현재 dev(qxrqwbfjwthwaapikacu)에 존재하는
--      테스트 행(title = 'Test1'/'Test2'/'Test3')에 시안 예시 카테고리 값을 채워
--      3색 배지(보도자료=파랑/파트너십=초록/공지=빨강)와 무배지 상태를 모두
--      화면에서 확인할 수 있게 한다. 마커('32_news_categories_seed_v1') 가드로
--      최초 1회만 적용 — 이후 재실행에서는 관리자가 수정한 값을 보존한다.
--
-- 주의:
--   - category는 nullable. 프론트(NewsSection.jsx)는 카테고리→배지 스타일 매핑에
--     없는 값(오탈자 등)을 만나면 중립 회색 배지로 폴백하고, null/빈 값이면
--     배지를 아예 렌더하지 않는다.
--   - 운영 DB에는 이 파일의 1)만 적용하고 2)(dev 전용 테스트 타이틀 매칭)는
--     운영에 'Test1'~'Test3' 타이틀 행이 존재할 리 없어 자연히 no-op이다.
-- =====================================================================

-- 마커 테이블 (20/30번과 동일 — 신규/부분 설치 대비 재선언)
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 1) category 컬럼 추가
-- ---------------------------------------------------------------------
alter table public.company_news add column if not exists category text;
alter table public.notices      add column if not exists category text;

-- ---------------------------------------------------------------------
-- 2) dev 시드 — 시안(Figma 1907:14893) 예시값
--    company_news: Test1=보도자료(파랑) / Test2=파트너십(초록) / Test3=공지(빨강)
--    notices:      Test1=공지(빨강)     / Test2=공지(빨강)     / Test3=미지정(무배지)
-- ---------------------------------------------------------------------
update public.company_news
set category = case title
  when 'Test1' then '보도자료'
  when 'Test2' then '파트너십'
  when 'Test3' then '공지'
end
where title in ('Test1', 'Test2', 'Test3')
  and not exists (
    select 1 from public.schema_migrations
    where version = '32_news_categories_seed_v1'
  );

update public.notices
set category = case title
  when 'Test1' then '공지'
  when 'Test2' then '공지'
  else category
end
where title in ('Test1', 'Test2')
  and not exists (
    select 1 from public.schema_migrations
    where version = '32_news_categories_seed_v1'
  );

insert into public.schema_migrations (version)
select '32_news_categories_seed_v1'
where not exists (
  select 1 from public.schema_migrations
  where version = '32_news_categories_seed_v1'
);
