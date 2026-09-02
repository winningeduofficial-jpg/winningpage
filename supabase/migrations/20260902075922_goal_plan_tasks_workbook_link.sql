-- goal_plan_tasks에 문제집(goal_workbooks) 연결 컬럼 추가 (QA 행286-B)
--
-- 왜
--   대시보드 "오늘의 계획" 카드와 "나의 노력" 문제집 진도가 지금까지 완전히
--   분리된 테이블이었다 — 과제를 "몇 페이지 풀기"로 적어도 그 진도가 문제집
--   current_page에 반영되지 않았다. workbook_id(선택)와 페이지 범위를 얹어
--   과제 하나를 특정 문제집의 특정 구간에 연결할 수 있게 한다.
--
-- workbook_id는 goal_workbooks 삭제 시 on delete set null — 문제집을 지워도
-- 이미 만든 계획 과제 자체(title/subject/status)는 남는다, 연결만 끊어진다.
-- page_from/page_to는 둘 다 선택(문제집 없이 과제만 쓰는 기존 흐름은 그대로),
-- 둘 다 있을 때만 순서 관계를 CHECK로 지킨다.

ALTER TABLE "public"."goal_plan_tasks"
  ADD COLUMN IF NOT EXISTS "workbook_id" bigint
    REFERENCES "public"."goal_workbooks"("id") ON DELETE SET NULL;

ALTER TABLE "public"."goal_plan_tasks"
  ADD COLUMN IF NOT EXISTS "page_from" integer;

ALTER TABLE "public"."goal_plan_tasks"
  ADD COLUMN IF NOT EXISTS "page_to" integer;

ALTER TABLE "public"."goal_plan_tasks"
  DROP CONSTRAINT IF EXISTS "goal_plan_tasks_page_range_check";
ALTER TABLE "public"."goal_plan_tasks"
  ADD CONSTRAINT "goal_plan_tasks_page_range_check"
  CHECK (
    "page_from" IS NULL OR "page_to" IS NULL OR "page_from" <= "page_to"
  );

CREATE INDEX IF NOT EXISTS "goal_plan_tasks_workbook_id_idx"
  ON "public"."goal_plan_tasks" ("workbook_id");

COMMENT ON COLUMN "public"."goal_plan_tasks"."workbook_id" IS '연결된 문제집(goal_workbooks.id), 선택. 문제집이 삭제되면 NULL로 풀린다(과제 자체는 남음). api/goal/plan-tasks.ts가 같은 profile 소유인지 검증한다.';
COMMENT ON COLUMN "public"."goal_plan_tasks"."page_from" IS '연결된 문제집 안에서 이 과제가 다루는 시작 페이지, 선택. workbook_id 없이 단독으로는 의미 없다(검증은 API 담당, DB는 순서 관계만 CHECK).';
COMMENT ON COLUMN "public"."goal_plan_tasks"."page_to" IS '연결된 문제집 안에서 이 과제가 다루는 끝 페이지, 선택. status가 done으로 바뀌고 이 값이 있으면 api/goal/plan-tasks.ts가 goal_workbooks.current_page를 max(current_page, page_to)로 전진시킨다(상한은 total_pages, 자동 완독/책장 이동은 하지 않음).';
