-- =====================================================================
-- 81_goal_student_reset.sql
-- 목표관리(/app/goal) 어드민 전용 "소프트 리셋" — 학생을 온보딩 이전
-- 상태로 되돌려 재입력을 받게 한다.
-- Supabase SQL Editor / Management API에서 수동 실행 필요.
-- (이 repo에 마이그레이션 러너 없음 — 접두어가 곧 수동 실행 순서다.)
-- idempotent — 여러 번 실행해도 안전(create or replace function).
--
-- 포함:
--   1) public.fn_goal_reset_student(uuid) — 온보딩 리셋 RPC
--
-- 배경:
--   온보딩 완료(goal_students.onboarded_at not null) 후에는 재입력이 409로
--   완전 차단돼 있다(api/goal/intake.js) — 오입력 정정이나 정시 컷이 늦게
--   채워진 학생을 구제할 방법이 없었다. 이 함수는 그 구제 수단이다. UI는
--   goal-admin 앱(PR #63, 이 브랜치엔 미포함)의 후속 작업이고, 여기서는
--   RPC + api/goal/admin/reset-student.js 만 만든다.
--
--   학생이 재접속하면 RequireGoalAccess.jsx가 onboarded_at is null 을 보고
--   자동으로 온보딩 폼으로 되돌린다(이미 구현돼 있음 — 신규 UI 불필요).
--
-- 무엇을 지우고 무엇을 보존하는가(핵심 설계 — 바꾸지 마라):
--   - goal_daily_records: 행은 삭제하지 않는다. delta_* 4컬럼만 0으로 되돌린다.
--     study_hours/achievement/focus/body_condition/reasons/tasks/memo 등은
--     리포트·랭킹이 실시간 조회하므로 학습 이력을 보존해야 한다.
--   - goal_probability_logs: append-only 감사 로그라 전량 삭제한다(리셋 후
--     새 온보딩이 base 확률을 다시 산출하면 이전 이력이 섞이면 안 된다).
--   - goal_students: status='awaiting_cuts', onboarded_at=null 로 되돌려
--     온보딩 게이트(requireActiveStudent, api/goal/daily-record.js:140-151)가
--     다시 막아서게 한다. 행 자체는 UPDATE만 하고 DELETE하지 않는다.
--   - goal_timer_sessions/goal_schedules/goal_plan_tasks/goal_workbooks/
--     goal_subject_targets/goal_mentor_comments: 절대 건드리지 않는다. 전부
--     goal_students(profile_id) on delete cascade로 걸려 있지만, 이 함수는
--     goal_students를 UPDATE만 하고 DELETE하지 않으므로 cascade가 발동하지
--     않는다 — 이게 의도된 설계다(학생이 지금까지 쌓은 타이머·시간표·플래너·
--     교재·과목목표·멘토코멘트를 리셋 한 방에 날리면 안 된다).
--
-- 동시성:
--   `select ... for update`로 goal_students 행을 잠그고 존재를 확인한다
--   (TOCTOU 방어 — 동시에 학생이 daily-record를 제출 중이면 이 락이 끝날
--   때까지 대기시킨다. daily-record.js/intake.js 자체엔 락이 없어서 완벽한
--   방어는 아니지만, 이 함수 실행 구간만큼은 직렬화된다).
--   plpgsql 함수 본문은 단일 트랜잭션이라 별도 BEGIN/COMMIT이 필요 없다.
--
-- 의존성:
--   - sql/55_goal_management.sql : public.goal_students, public.goal_daily_records,
--     public.goal_probability_logs
--   위 하나만 있으면 다른 마이그레이션과 독립 실행 가능하다.
--
-- 주의:
--   - service_role 전용이다(sql/64_entitlement_period_sessions.sql:608,1029
--     관례와 동일) — RLS를 우회하는 서버 라우트(api/goal/admin/reset-student.js)
--     에서만 호출한다. 어드민 판정(is_winning_admin 미러, resolveWinningAdmin)은
--     그 라우트가 진다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) fn_goal_reset_student : 온보딩 리셋
-- ---------------------------------------------------------------------
create or replace function public.fn_goal_reset_student(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  -- 행 잠금 + 존재 확인. 동시에 daily-record 제출이 진행 중이면 그 트랜잭션이
  -- 끝날 때까지 여기서 대기한다(TOCTOU 방어, 위 "동시성" 절 참고).
  select profile_id into v_profile_id
    from public.goal_students
   where profile_id = p_profile_id
   for update;

  if v_profile_id is null then
    raise exception 'goal_student_not_found';
  end if;

  -- 확률 증분만 0으로 되돌린다. 행 자체와 학습 기록 컬럼(study_hours 등)은
  -- 절대 지우지 않는다 — 리포트·랭킹이 이 컬럼들을 실시간 조회한다.
  update public.goal_daily_records
     set delta_ideal_susi   = 0,
         delta_ideal_jungsi = 0,
         delta_min_susi     = 0,
         delta_min_jungsi   = 0,
         updated_at         = now()
   where profile_id = p_profile_id;

  -- 확률 스냅샷 감사 로그는 append-only라 재온보딩 시 이전 이력과 섞이지
  -- 않도록 전량 삭제한다.
  delete from public.goal_probability_logs
   where profile_id = p_profile_id;

  -- 온보딩 이전 상태로 되돌린다. DELETE가 아니라 UPDATE라 다른 goal_* 테이블의
  -- on delete cascade가 발동하지 않는다(위 "무엇을 지우고 무엇을 보존하는가" 참고).
  update public.goal_students
     set status       = 'awaiting_cuts',
         onboarded_at = null,
         updated_at   = now()
   where profile_id = p_profile_id;
end;
$$;

comment on function public.fn_goal_reset_student(uuid) is
  '어드민 전용 소프트 리셋. 학생을 온보딩 이전 상태로 되돌린다(goal_students.status/onboarded_at) — 재접속 시 RequireGoalAccess.jsx가 자동으로 온보딩 폼으로 보낸다. goal_daily_records는 행을 지우지 않고 delta_* 4컬럼만 0으로 되돌린다(학습 이력 보존). goal_probability_logs는 전량 삭제. goal_timer_sessions/goal_schedules/goal_plan_tasks/goal_workbooks/goal_subject_targets/goal_mentor_comments는 절대 건드리지 않는다(cascade 미발동 — UPDATE only). service_role 전용, api/goal/admin/reset-student.js 에서만 호출. sql/81_goal_student_reset.sql 참고.';

revoke all on function public.fn_goal_reset_student(uuid) from public, anon, authenticated;
grant execute on function public.fn_goal_reset_student(uuid) to service_role;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- select routine_name from information_schema.routines
--   where routine_schema = 'public' and routine_name = 'fn_goal_reset_student';
--
-- select grantee, privilege_type from information_schema.routine_privileges
--   where routine_schema = 'public' and routine_name = 'fn_goal_reset_student'
--   order by grantee;
--   -- service_role(EXECUTE) 만 있어야 한다.
