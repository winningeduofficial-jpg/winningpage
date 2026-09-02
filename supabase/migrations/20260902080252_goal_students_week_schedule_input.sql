-- goal_students에 week_schedule_input 컬럼 추가 — QA 행293, 하루 일정 요일별·학원 다건 입력
--
-- 왜
--   기존 Step7(하루 일정)은 단일 세트 4필드(기상/취침/학교체류/학원)만 받아 study_schedule
--   (파생 요일별 목표)만 저장했다 — 원본 입력을 재구성할 수 없어 재편집·표시에 쓸 수 없었다.
--   이제 Step7이 요일별 {wake, sleep, hasSchool, schoolStart, schoolEnd, academies[]}을 받으므로
--   그 원본 입력을 그대로 보존해 둔다. study_schedule/week_ideal/week_min은 여전히 이
--   입력으로부터 calculateWeekSchedule()이 산출한 파생값이고, 이 컬럼은 재계산·재편집의
--   근거가 되는 원본이다(naesin_scores/mock_exam_scores와 같은 free-form jsonb 성격).

ALTER TABLE "public"."goal_students"
  ADD COLUMN IF NOT EXISTS "week_schedule_input" jsonb;

COMMENT ON COLUMN "public"."goal_students"."week_schedule_input" IS '온보딩 Step7(하루 일정) 요일별 원본 입력 — {mon..sun: {wake, sleep, hasSchool, schoolStart?, schoolEnd?, academies:[{start,end}]}}. study_schedule(파생 요일별 목표)와 달리 재계산·재편집의 근거가 되는 원본 입력이다. api/goal/intake.ts validateIntakeBody가 검증한 값을 그대로 저장한다.';
