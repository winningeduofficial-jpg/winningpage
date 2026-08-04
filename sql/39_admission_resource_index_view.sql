-- =====================================================================
-- 대입모집요강 목록 화면(src/pages/AdmissionGuidelines.jsx) 데이터 fetch 장애 수정.
-- Supabase SQL Editor / Management API에서 수동 실행 필요. (idempotent)
--
-- 배경: admission_university_resources는 raw 6종(previous_year_changes,
-- selection_method, minimum_requirements, exam_schedule,
-- school_record_method, recruitment_quota) + html 6종
-- (previous_year_changes_html, selection_method_html,
-- minimum_requirements_html, exam_schedule_html, school_record_method_html,
-- recruitment_result_html)이 각각 수 KB~수십 KB라 218행 select('*')의
-- 응답 합계가 5MB를 넘어 dev 인스턴스의 statement timeout(57014)에 걸린다.
-- 목록 표는 셀마다 "보기"/"-"만 판정하면 되므로 본문이 불필요하다 —
-- 경량 컬럼 + 카테고리별 존재 여부 불리언만 노출하는 뷰를 신설한다.
-- 본문은 모달 오픈 시 admission_university_resources에서 id로 on-demand
-- 조회한다 (프론트 변경, 이 파일과 무관).
--
-- security_invoker = true : PostgreSQL 17(이 프로젝트 버전)부터 지원.
-- 뷰 실행 권한을 뷰 소유자가 아닌 "호출자" 권한으로 강제해, 기반 테이블
-- admission_university_resources의 기존 RLS 정책
-- (admission_university_resources_public_read: is_active = true OR
-- is_winning_admin())을 뷰에서도 동일하게 존중하게 한다.
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
    (coalesce(recruitment_result_html, '') <> '') as has_recruitment_result_html
from public.admission_university_resources;

grant select on public.admission_university_resource_index to anon, authenticated;

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select count(*) from public.admission_university_resource_index;
-- select has_previous_year_changes, has_selection_method_html
-- from public.admission_university_resource_index limit 5;
