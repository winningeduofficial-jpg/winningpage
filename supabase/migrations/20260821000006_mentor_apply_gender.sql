-- 멘토신청 지원서 성별 필드 — QA 시트(멘토신청, 2026-08-21) 지시로 추가.
--
-- 프런트(src/components/mentorApply/FormSectionApplicant.tsx)에 성별(남/여) 선택 칩을
-- 먼저 추가했었고, 이 마이그레이션이 저장 배선을 완결한다.
--
-- 값 도메인은 이 테이블의 기존 단일 선택 칩 필드(admission_history/final_admission_track/
-- enrollment_status 등)와 같은 관행을 따른다 — 시안·프런트 옵션 문자열(한글)을 그대로
-- text CHECK 로 저장한다. profiles.gender/identity_verifications.gender 는 외부 본인인증
-- API(NICE) 응답을 그대로 흘려받는 컬럼이라 CHECK 이 없는 것이지, 이 테이블처럼 자체 폼
-- 옵션을 정의하는 필드와는 성격이 달라 그 쪽 관행(무제약 text)은 따르지 않았다.
-- src/data/mentorApply.ts GENDER_OPTIONS 와 반드시 같은 값을 유지할 것.
--
-- nullable — 기존 행(과거 제출분) 호환을 위해 NOT NULL 을 걸지 않는다. 신규 제출 필수
-- 여부는 애플리케이션 레이어(FormSectionApplicant.tsx validateApplicantSection,
-- api/mentor-apply.ts FIELD_SPECS)가 담당한다.
alter table public.mentor_applications
  add column gender text;

alter table public.mentor_applications
  add constraint mentor_applications_gender_check
  check (gender is null or gender = any (array['남'::text, '여'::text]));

comment on column public.mentor_applications.gender is
  '지원자 성별 — 남/여 단일 선택(QA 시트 2026-08-21 추가). 과거 제출분엔 값이 없어 nullable.';
