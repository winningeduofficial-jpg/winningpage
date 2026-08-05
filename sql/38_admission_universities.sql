-- =====================================================================
-- 대학별 모집요강(admission-data-migration 브랜치) 이관 스키마 보강.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 배경: 이 브랜치는 대학 목록 화면(src/pages/AdmissionGuidelines.jsx)이
-- `admission_universities` 테이블을 유일한 대학 마스터 소스로 사용하고,
-- 어드민(src/pages/Admin.jsx `admissionUniversities` 섹션)이 여기에
-- insert/update 하는데도 이 테이블의 DDL이 sql/에 커밋되어 있지 않았다.
-- 또한 HWP 원문 파싱 HTML 3종 컬럼(previous_year_changes_html /
-- selection_method_html / exam_schedule_html)도 00_base_schema.sql에
-- 없어 dev 외 환경(운영/신규 dev)에서 목록이 빈 화면이 되고 어드민 저장이
-- PGRST204로 실패한다.
--
-- 포함:
--   1) admission_universities 신규 테이블 (idempotent create) + is_active/
--      sort_order 인덱스 + RLS(public read / admin write, is_winning_admin())
--   2) admission_university_resources ALTER TABLE ADD COLUMN IF NOT EXISTS
--      HTML 3종
--   3) admission_university_resources 관리자 쓰기 정책 문서화·통일 —
--      dev DB에 이미 존재하던 admin_all 정책이 sql/에 전혀 기록되어 있지
--      않았고 is_admin() 기준이었다. README RLS 규약(is_winning_admin())에
--      맞춰 교체한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) admission_universities : 지역별 대학 목록 화면의 대학 마스터
-- ---------------------------------------------------------------------
create table if not exists public.admission_universities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    region text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0,
    special_group text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admission_universities_pkey PRIMARY KEY (id),
    constraint admission_universities_name_key UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS admission_universities_active_idx
  ON public.admission_universities USING btree (is_active);
CREATE INDEX IF NOT EXISTS admission_universities_sort_order_idx
  ON public.admission_universities USING btree (sort_order);

alter table public.admission_universities enable row level security;

drop policy if exists "admission_universities_public_read" on public."admission_universities";
create policy "admission_universities_public_read" on public."admission_universities" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true) OR public.is_winning_admin());

drop policy if exists "admission_universities_admin_all" on public."admission_universities";
create policy "admission_universities_admin_all" on public."admission_universities" as PERMISSIVE for ALL to public
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- 2) admission_university_resources : HWP 원문 파싱 HTML 3종 컬럼 보강
--    (previous_year_changes_html / selection_method_html / exam_schedule_html)
--    scripts/load-admission-content.mjs 및 InfoButton(AdmissionGuidelines.jsx)
--    이 6개 카테고리 전부의 *_html을 읽고/쓰는데, minimum_requirements_html·
--    school_record_method_html·recruitment_result_html 3개만 00_base_schema.sql에
--    있었다.
-- ---------------------------------------------------------------------
alter table public.admission_university_resources
  add column if not exists previous_year_changes_html text;
alter table public.admission_university_resources
  add column if not exists selection_method_html text;
alter table public.admission_university_resources
  add column if not exists exam_schedule_html text;

-- ---------------------------------------------------------------------
-- 3) admission_university_resources : 관리자 쓰기 정책을 sql/에 문서화하고
--    is_winning_admin() 기준으로 통일 (31_storage_policies.sql이 다른
--    테이블에 적용한 패턴과 동일). dev DB에는 이미 admin_all 정책과
--    public_read의 "OR is_admin()" 어드민 미리보기 허용 분기가 있었으나
--    00_base_schema.sql:1713에는 반영되어 있지 않았다(신규 환경 어드민
--    저장/비활성 행 미리보기 불가 상태) — 여기서 재정의해 문서화한다.
-- ---------------------------------------------------------------------
drop policy if exists "admission_university_resources_admin_all" on public."admission_university_resources";
create policy "admission_university_resources_admin_all" on public."admission_university_resources" as PERMISSIVE for ALL to public
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

drop policy if exists "admission_university_resources_public_read" on public."admission_university_resources";
create policy "admission_university_resources_public_read" on public."admission_university_resources" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true) OR public.is_winning_admin());

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'admission_university_resources'
--   and column_name like '%_html';
-- select count(*) from public.admission_universities;
