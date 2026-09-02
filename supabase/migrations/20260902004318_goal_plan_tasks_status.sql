-- goal_plan_tasks에 3상태(pending/done/fail) status 컬럼 추가 (QA 행305)
--
-- 왜
--   대시보드 "오늘의 계획" 행의 ✕ 클릭은 과제 삭제가 아니라 "미달성(fail)"
--   표시여야 한다. 기존 스키마는 done boolean 하나뿐이라 fail을 저장할 곳이
--   없었고, 그래서 지금까지 ✕는 DELETE로 배선돼 있었다(baseline.sql
--   goal_plan_tasks.done 컬럼 코멘트가 이 공백을 그대로 기록하고 있다).
--   GoalChecklistRow.tsx는 done/fail/pending 3상태 렌더를 이미 갖고 있었다
--   (스키마가 못 따라와서 못 쓰고 있었을 뿐).
--
-- 단일 원본은 status — done은 하위 호환을 위해 유지하되 API 쓰기 경로
-- (api/goal/plan-tasks.ts)가 status가 바뀔 때마다 done = (status='done')을
-- 함께 갱신한다. 기존 select("*") 소비처는 done을 계속 읽을 수 있다.

ALTER TABLE "public"."goal_plan_tasks"
  ADD COLUMN IF NOT EXISTS "status" "text" DEFAULT 'pending'::"text" NOT NULL;

ALTER TABLE "public"."goal_plan_tasks"
  DROP CONSTRAINT IF EXISTS "goal_plan_tasks_status_check";
ALTER TABLE "public"."goal_plan_tasks"
  ADD CONSTRAINT "goal_plan_tasks_status_check"
  CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'fail'::"text"])));

-- 기존 done=true 행 백필. done=false 행은 이미 컬럼 기본값 'pending'과 일치한다.
UPDATE "public"."goal_plan_tasks" SET "status" = 'done' WHERE "done" = true;

COMMENT ON COLUMN "public"."goal_plan_tasks"."status" IS '과제 상태 3종(pending/done/fail) — 단일 원본. 대시보드 체크(✓)는 done↔pending, ✕는 fail↔pending을 토글한다(api/goal/plan-tasks.ts). done boolean 컬럼은 하위 호환용 파생값으로 계속 함께 갱신된다.';

COMMENT ON COLUMN "public"."goal_plan_tasks"."done" IS '완료 여부(하위 호환 파생 컬럼, QA 행305 이전). 단일 원본은 status — 쓰기 경로가 항상 done = (status=''done'')로 함께 갱신한다. 신규 소비처는 status를 직접 읽어야 한다.';
