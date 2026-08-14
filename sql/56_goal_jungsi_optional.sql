-- =====================================================================
-- 정시 컷 없이도 온보딩 허용(Q1=(b) 채택) — goal_probability_logs
-- 정시 확률 2열 NOT NULL 해제.
-- Supabase SQL Editor / Management API에서 수동 실행 필요.
-- 선행: sql/55_goal_management.sql 이 실행되어 있어야 한다.
--
-- 배경 (docs/figma-goal/goal-admin-spec.md §7-1-A · §9-Q1, 개정 3):
--  정시 컷 원천(admission_results.percentile)이 0행이라 정시 컷을
--  외부 수집하지 않기로 확정했다. api/goal/intake.js 는 이제 정시
--  컷이 없어도 수시 확률만으로 온보딩을 완료시킨다(hasSusiCuts 게이트
--  만 필수, hasJungsiCuts 는 선택). 이 경로에서 appendProbabilityLog
--  가 ideal_jungsi/min_jungsi 에 null 을 저장하려 시도하는데,
--  sql/55_goal_management.sql:422-425 원판의 not null 이 그 insert 를
--  23502(not_null_violation)로 거부한다.
--
--  ideal_susi/min_susi 는 그대로 not null 로 남긴다 — 수시 컷은
--  여전히 온보딩의 필수 조건이라(hasSusiCuts 게이트가 없으면 422),
--  appendProbabilityLog 호출 시점엔 수시 확률 2종은 항상 값이 있다.
--
-- 재실행 안전성: alter ... drop not null 은 이미 nullable 이면 아무
--  일도 하지 않는다(idempotent). 몇 번 실행해도 안전하다.
-- =====================================================================

alter table public.goal_probability_logs
    alter column ideal_jungsi drop not null,
    alter column min_jungsi   drop not null;
