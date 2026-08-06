-- =====================================================================
-- 대입모집요강 구조화 문서(AdmissionDoc) jsonb 컬럼 추가.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 배경: admission_university_resources는 raw 6종(HWP 원문 텍스트) + html
-- 6종(생성/큐레이션 HTML)만 갖고 있었다. 구조화 전환(admission-structured-
-- json 브랜치)이 raw → doc(src/lib/admissionDoc.js 스키마) 파이프라인을
-- 추가했고, doc은 이 6개 jsonb 컬럼에 병행 저장된다 — *_html은 미러로
-- 계속 유지한다(삭제하지 않음, 롤백/레거시 렌더 대비).
--
-- 네이밍: 6개 전부 `<rawKey>_json` 접미어로 통일한다.
-- recruitment_quota만 html 쪽이 recruitment_result_html로 어긋나 있는데
-- (admissionParsing.js:HWP_SECTION_HTML_KEYS), 이 비대칭을 json 컬럼에서
-- 재생산하지 않는다 — recruitment_quota_json이다. 매핑 정본은
-- src/lib/admissionDoc.js의 HWP_SECTION_JSON_KEYS 단일 상수.
--
-- 형태 제약: jsonb_typeof(col) = 'object' 수준으로 가볍게만 건다. blocks
-- 배열 존재·컬럼 수 고정 등 스키마 세부 검증은 코드
-- (validateAdmissionDoc, src/lib/admissionDoc.js)의 책임이다 — SQL 제약으로
-- 전체 스키마를 검증하려 하지 않는다(과거 44_admission_resource_index_json_
-- flags.sql 설계 초안이 jsonb_array_length(col->'blocks')까지 강제하려다
-- {"blocks":"x"} 같은 형태 위반이 뷰 select 전체를 throw시키는 위험을
-- 만들 뻔했다 — 최소 제약 + 코드 검증 분리가 더 안전하다).
--
-- 백필은 여기 없다(파싱이 JS) — scripts/backfill-admission-doc.mjs.
-- =====================================================================

alter table public.admission_university_resources
  add column if not exists previous_year_changes_json jsonb;
alter table public.admission_university_resources
  add column if not exists selection_method_json jsonb;
alter table public.admission_university_resources
  add column if not exists minimum_requirements_json jsonb;
alter table public.admission_university_resources
  add column if not exists exam_schedule_json jsonb;
alter table public.admission_university_resources
  add column if not exists school_record_method_json jsonb;
alter table public.admission_university_resources
  add column if not exists recruitment_quota_json jsonb;

-- 6컬럼 전부 null(미기록) 또는 jsonb object만 허용. 배열/스칼라/문자열이
-- 실수로 들어가는 것만 막는다.
alter table public.admission_university_resources
  drop constraint if exists admission_resources_json_shape;
alter table public.admission_university_resources
  add constraint admission_resources_json_shape check (
    (previous_year_changes_json is null or jsonb_typeof(previous_year_changes_json) = 'object')
    and (selection_method_json is null or jsonb_typeof(selection_method_json) = 'object')
    and (minimum_requirements_json is null or jsonb_typeof(minimum_requirements_json) = 'object')
    and (exam_schedule_json is null or jsonb_typeof(exam_schedule_json) = 'object')
    and (school_record_method_json is null or jsonb_typeof(school_record_method_json) = 'object')
    and (recruitment_quota_json is null or jsonb_typeof(recruitment_quota_json) = 'object')
  );

-- RLS: 테이블 단위 정책(38_admission_universities.sql의
-- admission_university_resources_admin_all / _public_read)이 컬럼 추가에
-- 자동 상속된다. 여기서 정책을 새로 만들거나 건드리지 않는다.

-- 인덱스: 없음. 00_base_schema.sql의 기존 인덱스 4종은 전부 조회 조건
-- 컬럼용이고 본문 컬럼(raw/html)에는 인덱스가 없다 — jsonb도 동일 방침.

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'admission_university_resources'
--   and column_name like '%_json';
-- select count(*) filter (where previous_year_changes_json is not null) as filled
-- from public.admission_university_resources;

-- =====================================================================
-- 롤백
-- =====================================================================
-- alter table public.admission_university_resources
--   drop constraint if exists admission_resources_json_shape;
-- alter table public.admission_university_resources drop column if exists previous_year_changes_json;
-- alter table public.admission_university_resources drop column if exists selection_method_json;
-- alter table public.admission_university_resources drop column if exists minimum_requirements_json;
-- alter table public.admission_university_resources drop column if exists exam_schedule_json;
-- alter table public.admission_university_resources drop column if exists school_record_method_json;
-- alter table public.admission_university_resources drop column if exists recruitment_quota_json;
-- -- *_html 컬럼은 무손상 — 롤백해도 기존 화면은 그대로 동작한다.
