-- =====================================================================
-- 대입모집요강 목록 뷰(admission_university_resource_index)에
-- official_source_url 컬럼 노출.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 배경: 사용자 요청(2026-08-10) "official_source_url을 '대학이름'을 클릭했을
-- 때 나오는 링크로." — 공개 목록(src/pages/AdmissionGuidelines.jsx)의 대학명
-- 셀을 그 대학 입시 홈페이지로 가는 <a>로 승격한다.
--
-- official_source_url은 admission_university_resources에 이미 존재하는
-- 컬럼이고(00_base_schema.sql:347) dev 218행 전부 값이 채워져 있지만,
-- 목록이 읽는 것은 본체 테이블이 아니라 이 경량 뷰다. 뷰에 컬럼이 없으면
-- row.official_source_url이 undefined라 전 대학이 조용히 평문으로 렌더된다
-- — 콘솔 에러도, 게이트 실패도 없다. 그래서 이 파일이 코드 커밋보다
-- 먼저 온다.
--
-- ⚠ jungsi_guideline_url('정시모집요강 보기' 버튼이 읽는 컬럼)과 혼동하지
--    말 것. 두 컬럼은 dev에서 209행이 우연히 같은 값이지만 의미가 다르다:
--    jungsi_guideline_url = 정시모집요강 문서 링크(별도 셀 버튼),
--    official_source_url  = 대학 입시 홈페이지 링크(대학명 클릭).
--    이 파일은 jungsi_guideline_url을 건드리지 않는다.
--
-- 48번을 create or replace view로 확장한다 — 기존 29컬럼을 순서·이름·
-- 타입 그대로 두고 끝에 1컬럼만 추가한다(끝에 추가는 grant를 보존하지만
-- 컬럼 삭제/이름변경/타입변경은 42P16으로 거부된다. drop view는 grant를
-- 잃으므로 쓰지 않는다).
--
-- 본문 컬럼(raw/html/jsonb)은 이 뷰에 절대 노출하지 않는다 — 39번 신설
-- 사유가 218행 5MB 초과 statement timeout(57014)이었다. official_source_url은
-- 행당 수십 바이트 text 1개라 그 사유를 재발시키지 않는다.
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
     end) as has_recruitment_quota_json,
    -- 아래 1종만 50번 신규. 반드시 맨 뒤.
    official_source_url
from public.admission_university_resources;

grant select on public.admission_university_resource_index to anon, authenticated;

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select count(*) from public.admission_university_resource_index;
-- select university_name, official_source_url, jungsi_guideline_url
-- from public.admission_university_resource_index
-- where official_source_url is distinct from jungsi_guideline_url;

-- =====================================================================
-- 롤백
-- =====================================================================
-- 48번 정의로 되돌린다(official_source_url 1컬럼만 제거, 나머지는 48번과 동일).
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
--     (coalesce(recruitment_result_html, '') <> '') as has_recruitment_result_html,
--     (case when previous_year_changes_json is null then false
--        when jsonb_typeof(previous_year_changes_json -> 'blocks') = 'array'
--          then jsonb_array_length(previous_year_changes_json -> 'blocks') > 0
--        else false end) as has_previous_year_changes_json,
--     (case when selection_method_json is null then false
--        when jsonb_typeof(selection_method_json -> 'blocks') = 'array'
--          then jsonb_array_length(selection_method_json -> 'blocks') > 0
--        else false end) as has_selection_method_json,
--     (case when minimum_requirements_json is null then false
--        when jsonb_typeof(minimum_requirements_json -> 'blocks') = 'array'
--          then jsonb_array_length(minimum_requirements_json -> 'blocks') > 0
--        else false end) as has_minimum_requirements_json,
--     (case when exam_schedule_json is null then false
--        when jsonb_typeof(exam_schedule_json -> 'blocks') = 'array'
--          then jsonb_array_length(exam_schedule_json -> 'blocks') > 0
--        else false end) as has_exam_schedule_json,
--     (case when school_record_method_json is null then false
--        when jsonb_typeof(school_record_method_json -> 'blocks') = 'array'
--          then jsonb_array_length(school_record_method_json -> 'blocks') > 0
--        else false end) as has_school_record_method_json,
--     (case when recruitment_quota_json is null then false
--        when jsonb_typeof(recruitment_quota_json -> 'blocks') = 'array'
--          then jsonb_array_length(recruitment_quota_json -> 'blocks') > 0
--        else false end) as has_recruitment_quota_json
-- from public.admission_university_resources;
-- grant select on public.admission_university_resource_index to anon, authenticated;
