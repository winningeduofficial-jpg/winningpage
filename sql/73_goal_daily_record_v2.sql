-- =====================================================================
-- 73_goal_daily_record_v2.sql
-- 목표관리 일별 기록 수식 v2 — body_condition 값 도메인을 실제 UI(오늘의
-- 공부 기록 #26, src/data/goalStudyMock.js mockConditionOptions)와 맞춘다.
-- Supabase SQL Editor / Management API에서 수동 실행 필요. idempotent.
--
-- ⚠ 번호 메모: 팀장 작업 지시서는 이 파일을 72번으로 지정했으나, 이 브랜치를
--   딴 시점(dev@9ef6686)에 이미 72_learning_diagnosis_v2_survey_copy.sql 이
--   그 번호를 선점하고 있었다(sql/README.md 43번째 행 계열 선례와 동일한
--   충돌 — 접두어가 곧 수동 실행 순서라 번호 중복은 실행 사고로 이어진다).
--   그래서 73으로 옮겼다. 다른 마이그레이션과 의존 관계가 없어 순서상 문제는
--   없다.
--
-- 선행: sql/55_goal_management.sql (goal_daily_records.body_condition 원판)
--
-- 배경 (팀장 작업 지시 "확정 설계" §수식 v2):
--   신시안(#26 오늘의 공부 기록)의 "오늘의 컨디션" 섹션은 4지선다
--   great(아주 좋음)/normal(보통)/tired(피곤함)/exhausted(힘듦)다
--   (goalStudyMock.js mockConditionOptions). 원본 55번 파일의 body_condition
--   CHECK는 원본 앱(target/api/student.mjs:2656 condition)의 값 도메인
--   good/normal/bad 를 그대로 옮긴 것이었는데, 신시안 4지선다와 어휘도
--   개수도 다르다 — 이 상태로 UI 값을 그대로 insert하면 23514
--   (check_violation)로 저장이 전량 실패한다.
--
--   마이그레이션 불요 사유: sql/55 코멘트가 이미 "테이블이 비어 있어
--   마이그레이션 불요"인 시점(daily-record API가 이번 작업 전까지 없어
--   goal_daily_records에 쓰기 경로가 하나도 없었다)이고, 이 브랜치 기준
--   dev DB의 goal_daily_records는 실측 0행이다. 값 UPDATE가 필요 없다 —
--   CHECK 교체만으로 충분하다.
--
--   컨디션배수 계산 이관: 기존 코멘트("계산 파이프라인은 이 값을 쓰지
--   않는다, 표시 전용")는 v1 한정 서술이었다. v2 수식(bonusV2.js
--   CONDITION_MULTIPLIER)은 이 컬럼을 실제로 곱셈에 쓴다 — 컬럼 코멘트를
--   갱신해 이 문서 낙후를 막는다.
--
--   achievement/focus: v2 수식은 이 두 컬럼을 전혀 읽지 않는다(팀장 지시
--   "수식 v2" — 달성률배수·컨디션배수·과목태그배수 3종만 곱한다, 성취도·
--   집중도 자기평가 항목 자체가 v2 UI에 없다). 컬럼·CHECK는 스키마 무변경
--   유지(원판 sql/55 그대로 재구현하지 않는다) — API가 항상 ''(빈 문자열)로
--   저장한다. 코멘트만 이 사실을 명문화해 다음 사람이 "왜 항상 빈값인가"를
--   컬럼 코멘트만 보고 알 수 있게 한다.
-- =====================================================================

-- body_condition CHECK 교체: good/normal/bad(원본 3지) → 빈값 + great/normal/
-- tired/exhausted(신시안 4지, 오늘의 컨디션 섹션). 'normal'은 두 도메인에
-- 공통으로 존재하지만 의미가 다르므로(원본 "보통" ↔ 신시안 "보통", 우연히
-- 라벨만 같다) 이관 UPDATE는 하지 않는다 — 위 배경 절대로 테이블이 비어 있어
-- 대상 행이 없다.
alter table public.goal_daily_records
    drop constraint if exists goal_daily_records_body_condition_check;

alter table public.goal_daily_records
    add constraint goal_daily_records_body_condition_check
        check (body_condition in ('', 'great', 'normal', 'tired', 'exhausted'));

comment on column public.goal_daily_records.body_condition is
    '컨디션. 신시안 "오늘의 공부 기록"(#26) 4지선다 — great(아주 좋음)/normal(보통)/tired(피곤함)/exhausted(힘듦), 빈 문자열은 대시보드 카드-only 제출(컨디션 미입력)이다. src/lib/goal/calc/bonusV2.js CONDITION_MULTIPLIER(great=1.1/normal=1.0/tired=0.9/exhausted=0.8)의 곱셈 입력이다 — v1(원본 study_records.condition, student.mjs:2656)의 good/normal/bad 3지 값 도메인과 "계산에 쓰이지 않는 표시 전용" 서술은 sql/73_goal_daily_record_v2.sql로 대체됐다. 원본 achievement/focus 자기평가 항목은 v2 UI에 없다.';

comment on column public.goal_daily_records.achievement is
    '성취도. v1(원본 study_records.achievement, student.mjs:2654) 전용 컬럼이었으나 v2 수식(bonusV2.js calculateDailyBonusV2 — 달성률배수×컨디션배수×과목태그배수 3종만 곱한다)은 이 값을 읽지 않는다. api/goal/daily-record.js는 항상 빈 문자열로 저장한다. 스키마·CHECK는 sql/55_goal_management.sql 원판 그대로 유지(재구현하지 않음) — 향후 v1 계산으로 되돌릴 가능성을 열어 둔다.';

comment on column public.goal_daily_records.focus is
    '집중도. achievement와 동일한 사유로 v2에서 미사용, ''(빈 문자열) 고정 저장. 원본 study_records.focus(student.mjs:2655), FOCUS_MULTIPLIER(bonus.js:36-42)는 v1 전용이다.';
