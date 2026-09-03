-- QA3 행305 — 오늘의 공부 기록 제출 후 12시간 쿨다운(수정 불가) 지원.
--
-- 쿨다운 판정은 "가장 최근 제출 시각"이 필요하다. created_at/updated_at은
-- (profile_id, record_date) upsert 트리거(trg_goal_daily_records_updated_at)가
-- 매 UPDATE마다 갱신되므로 그대로 재사용해도 되지만, 쿨다운 로직이 "언제 이
-- 값을 다시 써도 되는지" 판단하는 컬럼임을 명시적으로 드러내기 위해 별도
-- 컬럼으로 신설한다(updated_at은 이후에도 여러 이유로 갱신될 여지가 열려
-- 있는 범용 컬럼이라 의미를 겹치지 않게 분리).
--
-- api/goal/daily-record.ts POST가 저장 성공마다 now()로 덮어쓴다. 기존 행은
-- updated_at(없으면 created_at)으로 1회 백필한다.

ALTER TABLE "public"."goal_daily_records"
  ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;

UPDATE "public"."goal_daily_records"
   SET "submitted_at" = COALESCE("updated_at", "created_at")
 WHERE "submitted_at" IS NULL;

ALTER TABLE "public"."goal_daily_records"
  ALTER COLUMN "submitted_at" SET DEFAULT now(),
  ALTER COLUMN "submitted_at" SET NOT NULL;

COMMENT ON COLUMN "public"."goal_daily_records"."submitted_at" IS 'QA3 행305 — 12시간 쿨다운 판정 기준 시각. api/goal/daily-record.ts POST가 저장 성공마다 now()로 덮어쓴다. record_date(가상 날짜)와 달리 실제 KST 시각 그대로다. 기존 행 백필값 = coalesce(updated_at, created_at).';
