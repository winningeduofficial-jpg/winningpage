-- goal_advice_cache — QA 행295·306 AI 입시조언 / 오늘의 조언·내일 계획 캐시.
--
-- api/goal/advice.ts 전용. Gemini 호출은 학생당 하루 소스별(intake/daily) 1회로
-- 제한한다 — 레이트리밋은 이 캐시 자체다(같은 (profile_id, source, generated_for)로
-- 재호출하면 저장된 payload를 그대로 반환하고 모델을 다시 부르지 않는다).
--
-- generated_for는 KST 날짜(record_date와 같은 규약, goal_daily_records 참고) —
-- "오늘 하루" 단위 캐시 키다. source='intake'는 온보딩 완료 직후 1회 생성되고
-- 그 뒤로는 재생성되지 않는다(항상 onboarded_at 당일 날짜로 1행만 쌓인다).
-- source='daily'는 "오늘의 공부 기록" 저장 성공 시마다 그날 값을 덮어쓴다(재제출
-- upsert와 동일 정책 — goal_daily_records처럼 하루 1행).
--
-- origin은 실제로 무엇이 payload를 만들었는지 표시한다 — 'ai'는 Gemini 생성,
-- 'rule'은 Gemini 실패/키 미설정 시 규칙 기반 폴백(같은 payload shape, 문자열
-- 상수 아님). 대시보드 "AI 입시 분석 조언" 뱃지는 origin='ai'일 때만 뜬다.

CREATE TABLE IF NOT EXISTS "public"."goal_advice_cache" (
    "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "profile_id" uuid NOT NULL REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE,
    "source" text NOT NULL CHECK ("source" IN ('intake', 'daily')),
    "generated_for" date NOT NULL,
    "origin" text NOT NULL CHECK ("origin" IN ('ai', 'rule')),
    "payload" jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE ("profile_id", "source", "generated_for")
);

ALTER TABLE "public"."goal_advice_cache" OWNER TO "postgres";

COMMENT ON TABLE "public"."goal_advice_cache" IS 'QA 행295·306 AI 입시조언(intake) / 오늘의 조언·내일 계획(daily) 캐시 — 학생×소스×날짜 1행. api/goal/advice.ts 만 쓴다. 원본 target/App.tsx의 ai_advice_cache 테이블 대응(App.tsx 캐시는 학생당 1행이었으나 여기는 하루 1행 — 실제 달력 모델과 정합).';

COMMENT ON COLUMN "public"."goal_advice_cache"."source" IS '트리거 종류. intake=온보딩 완료 직후(§3.16), daily=오늘의 공부 기록 저장 성공 직후.';
COMMENT ON COLUMN "public"."goal_advice_cache"."generated_for" IS 'KST 날짜(goal_daily_records.record_date와 같은 규약) — 캐시 키의 날짜 축. 하루 지나면 재생성 대상이 된다.';
COMMENT ON COLUMN "public"."goal_advice_cache"."origin" IS 'ai=Gemini 생성, rule=Gemini 실패/GEMINI_API_KEY 미설정 시 규칙 기반 폴백. 대시보드 뱃지("AI 입시 분석 조언" ↔ "일일 분석 조언") 분기 근거.';
COMMENT ON COLUMN "public"."goal_advice_cache"."payload" IS '{ probabilitySummary, sections:[{label,body}], majorTips:[{department,text}] } — api/goal/advice.ts buildAdvicePayload() 계약. 두 origin이 동일한 shape을 쓴다(폴백도 문자열 상수가 아니다).';

CREATE INDEX IF NOT EXISTS "goal_advice_cache_profile_idx"
  ON "public"."goal_advice_cache" USING btree ("profile_id", "generated_for" DESC);

ALTER TABLE "public"."goal_advice_cache" ENABLE ROW LEVEL SECURITY;

-- goal_daily_records와 동일 패턴(sql: 20260821000000_baseline.sql:9558-9565) — 쓰기는
-- service_role(api/goal/advice.ts)만, 학생 본인은 조회만, 어드민은 전체 조회.
CREATE POLICY "goal_advice_cache_select_own" ON "public"."goal_advice_cache"
  FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));

CREATE POLICY "goal_advice_cache_admin_select" ON "public"."goal_advice_cache"
  FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());

GRANT ALL ON TABLE "public"."goal_advice_cache" TO "anon";
GRANT ALL ON TABLE "public"."goal_advice_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_advice_cache" TO "service_role";
