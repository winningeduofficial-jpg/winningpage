-- 학습진단 리포트 영속화 — QA 시트 행 210(학부모 MY 자녀 학습 리포트).
--
-- 배경: 지금까지 학습진단 결과는 sessionStorage 에만 있었다. diagnosis_attempts 는
-- 과금·멱등 원장이라 응답·점수·리포트 본문 컬럼이 없고, 학생 본인도 새 탭이나 다른
-- 기기에서는 결과를 다시 볼 수 없었다(마이페이지 "결과 리포트 보기"가 설문으로 튕김).
-- 학부모 열람은 구조적으로 불가능했다.
--
-- 설계: goal_direction_reports(20260902081940)와 같은 payload/snapshot 이원 저장.
--   snapshot = 제출 시점 DiagnosisInput 전문(입결 컷·메타 sibling 필드 포함).
--   payload  = 그 입력으로 조립한 리포트 본문(buildReport 출력). 열람은 payload 로
--              그대로 렌더한다 — 리포트는 '진단 완료일'의 문서라 이후 엔진·문구 변경에
--              따라 바뀌면 안 된다(reportFileName.ts 의 파일명 원칙과 같은 판단).
--   schema_version = snapshot 이 따르는 diagnosisInputStorage SCHEMA_VERSION. 재채점이
--              필요해질 때 어떤 행을 다시 조립할 수 있는지 가르는 기준.
-- attempt_id 가 PK 이자 diagnosis_attempts FK 다 — 시도 1건당 리포트 1건, 저장은
-- upsert 로 멱등(제출 직후 저장 실패 시 리포트 페이지가 재시도한다).
--
-- 읽기: 본인 / 승인 연결된 학부모(fn_is_linked_pair, coupon_grants 정책과 같은 패턴) /
--       관리자. 쓰기 정책은 만들지 않는다 — api/diagnosis/report (service_role) 경유만.

create table public.diagnosis_reports (
  attempt_id uuid primary key
    references public.diagnosis_attempts(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  schema_version integer not null,
  diagnosed_at timestamptz not null,
  snapshot jsonb not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.diagnosis_reports is
  '학습진단 리포트 영속본. attempt_id = diagnosis_attempts pk(시도 1건당 1행, upsert 멱등). snapshot 은 제출 시점 DiagnosisInput 전문, payload 는 조립된 리포트 본문(열람은 payload 로 렌더). 쓰기는 api/diagnosis/report(service_role) 경유만.';

create index diagnosis_reports_profile_diagnosed_idx
  on public.diagnosis_reports (profile_id, diagnosed_at desc);

alter table public.diagnosis_reports enable row level security;

create policy "diagnosis_reports select own linked admin"
  on public.diagnosis_reports for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.fn_is_linked_pair(auth.uid(), profile_id)
    or public.is_winning_admin()
  );

grant select on public.diagnosis_reports to authenticated;
grant all on public.diagnosis_reports to service_role;
