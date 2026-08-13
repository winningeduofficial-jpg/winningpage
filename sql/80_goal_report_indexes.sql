-- =====================================================================
-- 80_goal_report_indexes.sql
-- 목표관리(/app/goal) 성장 리포트(#33/#34) 조회 전용 보조 인덱스.
-- Supabase SQL Editor / Management API에서 수동 실행 필요. idempotent.
--
-- 배경(임무 지시 "I: 리포트 3종 구현" §D4 목표군 내 위치):
--   리포트의 "목표군 내 위치" KPI는 동일 이상목표 대학·학과(goal_students.
--   ideal_university + ideal_department, status='active') 코호트를 조회한다
--   (src/lib/goal/report/aggregate.js computeCohortPercentile 이 그 결과를 받아
--   백분위를 계산 — 여기는 순수 함수라 조회 자체는 api/_lib/goalRepo.js가 한다).
--   이 조합에 걸리는 인덱스가 없었다 — sql/55_goal_management.sql은
--   goal_students_status_idx(status 단독)만 두었다(§학적 절 실측).
--
--   리포트가 참조하는 나머지 조회 경로는 이미 인덱스가 있어 이 파일에 새로
--   추가하지 않는다(실측 — 중복 인덱스 생성 방지):
--     - goal_daily_records(profile_id, record_date) — sql/55
--       goal_daily_records_date_key(UNIQUE), D1/D2/D6/D8 요일별 조회가 그대로 탄다.
--     - goal_probability_logs(profile_id, created_at) — sql/55
--       goal_probability_logs_profile_created_idx, D-합격가능성 델타 스냅샷 조회.
--     - goal_timer_sessions(profile_id, session_date) — sql/77
--       goal_timer_sessions_profile_date_idx, D7/D8 조회.
--     - goal_plan_tasks(profile_id, plan_date) — sql/75
--       goal_plan_tasks_profile_date_idx, D3 완성도 계획 축 조회.
--
-- 의존성: sql/55_goal_management.sql(goal_students 테이블). 독립 실행 가능.
-- =====================================================================

-- 코호트 조회: WHERE ideal_university = ? AND ideal_department = ? AND status = 'active'.
-- status 조건을 부분 인덱스로 접어 활성 학생만 인덱싱한다(paused/awaiting_cuts 학생은
-- 코호트 대상이 아니다 — computeCohortPercentile 은 어차피 이들을 받지 않는다).
create index if not exists goal_students_ideal_target_idx
    on public.goal_students (ideal_university, ideal_department)
    where status = 'active';
