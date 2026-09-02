-- goal_workbooks에 shelved_at 컬럼 추가 — "책장에 꽂기" 수동 전이(Figma 4026:6046)
--
-- 왜
--   지금은 computeWorkbookStatus()가 current_page/total_pages 비교만으로
--   status='done'을 자동 확정한다(api/_lib/goalRepo.ts). 그런데 시안은 100%
--   달성해도 곧바로 책장에 꽂히지 않고, 학생이 "완독! 책장에 꽂기" 버튼을 직접
--   눌러야 EffortSubjectCard 하단 BookStack으로 넘어간다 — 자동 전이와 수동
--   전이 사이에 별도 시점이 하나 더 있다.
--
--   status는 그대로 자동 계산 값(달성률 100%인지)을 유지한다 — "공부 중인 책"
--   섹션의 진행바·달성률 표시는 status만으로 충분하다. shelved_at은 오직
--   "책장에 실제로 꽂았는지"만 표현하는 별도 원본이다. status='done'이지만
--   shelved_at이 null인 행은 "완독은 했지만 아직 책장에 안 꽂음" 상태로,
--   공부 중인 책 목록에 "완독! 책장에 꽂기" 버튼과 함께 계속 남는다.
--
-- 완독 N권 카운터·BookStack 표시는 이제부터 status가 아니라 shelved_at 기준이다.

ALTER TABLE "public"."goal_workbooks"
  ADD COLUMN IF NOT EXISTS "shelved_at" timestamp with time zone;

-- 기존 status='done' 행 백필 — 실제로 꽂은 시각 기록이 없어(이번 컬럼 신설 이전에는
-- done=즉시 책장행이었다) updated_at으로 근사한다(트리거 trg_goal_workbooks_updated_at이
-- 매 UPDATE마다 채워온 값이라, 마지막으로 done이 확정된 시점과 가장 가깝다).
UPDATE "public"."goal_workbooks"
  SET "shelved_at" = "updated_at"
  WHERE "status" = 'done' AND "shelved_at" IS NULL;

COMMENT ON COLUMN "public"."goal_workbooks"."shelved_at" IS '"완독! 책장에 꽂기" 버튼을 눌러 BookStack으로 옮긴 시각(null이면 아직 책장에 안 꽂음). status=''done''인 행만 세팅 가능(api/goal/workbooks.ts PUT {shelve:true} 검증). status와 별개 원본 — status는 페이지 진도로 자동 계산되고, shelved_at은 사용자의 명시적 행동만으로 채워진다.';
