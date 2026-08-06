-- =====================================================================
-- 대입모집요강 목록 뷰(39_admission_resource_index_view.sql)에
-- has_*_json 6종 존재 여부 플래그 추가.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 배경: 43_admission_section_json.sql이 admission_university_resources에
-- *_json 6종을 추가했다. 목록 화면(sectionHasContent,
-- src/pages/AdmissionGuidelines.jsx)이 has_{key}/has_{htmlKey}만 보고
-- "보기"/"-"를 판정하므로, has_{jsonKey}를 OR로 추가하지 않으면 json으로만
-- 채워진 셀(향후 doc-only 저장)이 목록에서 dead payload가 된다.
--
-- 39번을 create or replace view로 확장한다 — 기존 23컬럼을 순서·이름·
-- 타입 그대로 두고 끝에 6컬럼만 추가한다(끝에 추가는 grant를 보존하지만
-- 컬럼 삭제/이름변경/타입변경은 42P16으로 거부된다. drop view는 grant를
-- 잃으므로 쓰지 않는다).
--
-- 판정 로직: `col is not null and jsonb_array_length(col->'blocks') > 0`을
-- 그대로 쓰지 않는다 — 43번의 형태 제약은 `jsonb_typeof(col)='object'`
-- 수준으로만 가볍다(설계 결정, 코드 검증에 위임). blocks 키가 없거나
-- 배열이 아닌 형태가 실수로 들어오면 jsonb_array_length가 throw해 뷰
-- select 전체가 죽는다(과거 39번 statement timeout과 동급 장애). CASE로
-- jsonb_typeof(col->'blocks')='array'를 먼저 확인한 뒤에만
-- jsonb_array_length를 호출해 이 경로를 막는다.
--
-- 본문 jsonb는 이 뷰에 절대 노출하지 않는다 — 39번 신설 사유가 218행
-- 5MB 초과 statement timeout(57014)이었고 JSON은 HTML보다 커질 수 있다.
-- =====================================================================

create or replace view public.admission_university_resource_index
with (security_invoker = true) as
select
    id,
    admission_year,
    region,
    university_name,
    university_key,
    matched_hwp_name,
    matched_text_name,
    campus,
    detail_status,
    jungsi_guideline_url,
    is_active,
    (coalesce(previous_year_changes, '') <> '') as has_previous_year_changes,
    (coalesce(selection_method, '') <> '') as has_selection_method,
    (coalesce(minimum_requirements, '') <> '') as has_minimum_requirements,
    (coalesce(exam_schedule, '') <> '') as has_exam_schedule,
    (coalesce(school_record_method, '') <> '') as has_school_record_method,
    (coalesce(recruitment_quota, '') <> '') as has_recruitment_quota,
    (coalesce(previous_year_changes_html, '') <> '') as has_previous_year_changes_html,
    (coalesce(selection_method_html, '') <> '') as has_selection_method_html,
    (coalesce(minimum_requirements_html, '') <> '') as has_minimum_requirements_html,
    (coalesce(exam_schedule_html, '') <> '') as has_exam_schedule_html,
    (coalesce(school_record_method_html, '') <> '') as has_school_record_method_html,
    (coalesce(recruitment_result_html, '') <> '') as has_recruitment_result_html,
    -- 아래 6종만 45번 신규. 반드시 맨 뒤.
    (case
       when previous_year_changes_json is null then false
       when jsonb_typeof(previous_year_changes_json -> 'blocks') = 'array'
         then jsonb_array_length(previous_year_changes_json -> 'blocks') > 0
       else false
     end) as has_previous_year_changes_json,
    (case
       when selection_method_json is null then false
       when jsonb_typeof(selection_method_json -> 'blocks') = 'array'
         then jsonb_array_length(selection_method_json -> 'blocks') > 0
       else false
     end) as has_selection_method_json,
    (case
       when minimum_requirements_json is null then false
       when jsonb_typeof(minimum_requirements_json -> 'blocks') = 'array'
         then jsonb_array_length(minimum_requirements_json -> 'blocks') > 0
       else false
     end) as has_minimum_requirements_json,
    (case
       when exam_schedule_json is null then false
       when jsonb_typeof(exam_schedule_json -> 'blocks') = 'array'
         then jsonb_array_length(exam_schedule_json -> 'blocks') > 0
       else false
     end) as has_exam_schedule_json,
    (case
       when school_record_method_json is null then false
       when jsonb_typeof(school_record_method_json -> 'blocks') = 'array'
         then jsonb_array_length(school_record_method_json -> 'blocks') > 0
       else false
     end) as has_school_record_method_json,
    (case
       when recruitment_quota_json is null then false
       when jsonb_typeof(recruitment_quota_json -> 'blocks') = 'array'
         then jsonb_array_length(recruitment_quota_json -> 'blocks') > 0
       else false
     end) as has_recruitment_quota_json
from public.admission_university_resources;

grant select on public.admission_university_resource_index to anon, authenticated;

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select count(*) from public.admission_university_resource_index;
-- select has_selection_method, has_selection_method_html, has_selection_method_json
-- from public.admission_university_resource_index limit 5;

-- =====================================================================
-- 롤백
-- =====================================================================
-- 39번 정의로 되돌린다(has_*_json 6컬럼만 제거, 나머지는 39번과 동일).
-- create or replace view public.admission_university_resource_index
-- with (security_invoker = true) as
-- select
--     id, admission_year, region, university_name, university_key,
--     matched_hwp_name, matched_text_name, campus, detail_status,
--     jungsi_guideline_url, is_active,
--     (coalesce(previous_year_changes, '') <> '') as has_previous_year_changes,
--     (coalesce(selection_method, '') <> '') as has_selection_method,
--     (coalesce(minimum_requirements, '') <> '') as has_minimum_requirements,
--     (coalesce(exam_schedule, '') <> '') as has_exam_schedule,
--     (coalesce(school_record_method, '') <> '') as has_school_record_method,
--     (coalesce(recruitment_quota, '') <> '') as has_recruitment_quota,
--     (coalesce(previous_year_changes_html, '') <> '') as has_previous_year_changes_html,
--     (coalesce(selection_method_html, '') <> '') as has_selection_method_html,
--     (coalesce(minimum_requirements_html, '') <> '') as has_minimum_requirements_html,
--     (coalesce(exam_schedule_html, '') <> '') as has_exam_schedule_html,
--     (coalesce(school_record_method_html, '') <> '') as has_school_record_method_html,
--     (coalesce(recruitment_result_html, '') <> '') as has_recruitment_result_html
-- from public.admission_university_resources;
-- grant select on public.admission_university_resource_index to anon, authenticated;
