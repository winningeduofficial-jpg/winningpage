-- 열공 타이머(#25) 과목 확장 — 4과목 고정 → 카탈로그 8종 중 학생이 자율 추가 (QA B9)
--
-- 왜
--   지금 열공 타이머는 과목 코드 CHECK 제약이 5종(korean/math/english/science/etc)
--   이고, 화면(Timer.tsx)은 그중 4종(etc 제외)만 고정 2×2 그리드로 보여준다. QA
--   B9는 "+ 과목 추가" 요구다 — 설계는 옵션 A(자유 입력이 아니라 정해진 카탈로그
--   중에서 고르기, docs 없음 — team-lead 확정)로, 카탈로그에 사회/한국사/제2외국어
--   3종을 더한다(탐구=과학·사회탐구 포괄 라벨은 그대로 유지, 기타도 유지).
--
--   과목 코드는 goal_timer_sessions·goal_subject_targets·goal_plan_tasks 세
--   테이블이 공유하는 CHECK 도메인이라(baseline 5371/5802/5849) 세 곳 다 같이
--   넓힌다 — 이 중 하나만 넓히면 예를 들어 새 과목으로 시작한 타이머 세션은
--   저장되는데 그 과목의 목표 시간(goal_subject_targets)은 저장할 수 없는
--   불일치가 생긴다.
--
-- 왜 새 테이블(goal_timer_subjects)이 필요한가
--   "이 학생이 타이머 화면에 무슨 과목 카드를 노출 중인가"는 기존 두 테이블
--   어디에도 없는 정보다 — goal_timer_sessions는 "실제로 측정을 시작한 적
--   있는 과목"만 알고, goal_subject_targets는 "목표 시간을 설정한 적 있는
--   과목"만 안다. 둘 다 "카드는 있지만 아직 시작도 목표 설정도 안 한 과목"을
--   표현할 수 없다 — 그래서 노출 여부만 담는 얇은 테이블을 별도로 둔다.
--
--   기본 4과목(math/korean/english/science)은 이 테이블에 행이 없어도 항상
--   노출된다(fetchVisibleTimerSubjects, api/_lib/goalRepo.ts) — 기존 학생
--   전원을 위한 백필이 필요 없다. 첫 "+ 과목 추가" 시점에 서버가 그 기본
--   4개를 sort_order 0..3으로 먼저 물질화한 뒤 새 과목을 이어 추가한다
--   (addTimerSubject) — 그래야 이후 카드 순서가 "추가한 순서" 그대로 안정된다.
--
-- 왜 쓰기 정책이 없나(service_role 전용)
--   다른 목표관리 테이블(goal_subject_targets 등)과 동일 관례 — 클라이언트가
--   직접 upsert하지 않고 항상 api/goal/timer.ts(POST action=addSubject)를
--   거친다. RLS는 select만 열어(본인 + 어드민) 조회 경로만 보장한다.

-- ---------------------------------------------------------------------
-- 1) CHECK 제약 3종 확장(5종 → 8종): korean/math/english/science/etc
--    + social/history/second_lang
-- ---------------------------------------------------------------------

ALTER TABLE "public"."goal_plan_tasks"
  DROP CONSTRAINT IF EXISTS "goal_plan_tasks_subject_check";
ALTER TABLE "public"."goal_plan_tasks"
  ADD CONSTRAINT "goal_plan_tasks_subject_check"
  CHECK (("subject" = ANY (ARRAY[
    'korean'::"text", 'math'::"text", 'english'::"text", 'science'::"text",
    'social'::"text", 'history'::"text", 'second_lang'::"text", 'etc'::"text"
  ])));

ALTER TABLE "public"."goal_subject_targets"
  DROP CONSTRAINT IF EXISTS "goal_subject_targets_subject_check";
ALTER TABLE "public"."goal_subject_targets"
  ADD CONSTRAINT "goal_subject_targets_subject_check"
  CHECK (("subject" = ANY (ARRAY[
    'korean'::"text", 'math'::"text", 'english'::"text", 'science'::"text",
    'social'::"text", 'history'::"text", 'second_lang'::"text", 'etc'::"text"
  ])));

ALTER TABLE "public"."goal_timer_sessions"
  DROP CONSTRAINT IF EXISTS "goal_timer_sessions_subject_check";
ALTER TABLE "public"."goal_timer_sessions"
  ADD CONSTRAINT "goal_timer_sessions_subject_check"
  CHECK (("subject" = ANY (ARRAY[
    'korean'::"text", 'math'::"text", 'english'::"text", 'science'::"text",
    'social'::"text", 'history'::"text", 'second_lang'::"text", 'etc'::"text"
  ])));

COMMENT ON COLUMN "public"."goal_subject_targets"."subject" IS '과목 코드 8종(korean/math/english/science/social/history/second_lang/etc). 한글 라벨(국어/수학/영어/탐구/사회/한국사/제2외국어/기타)과의 매핑은 api/_lib/goalRepo.ts SUBJECT_CODE_TO_LABEL/SUBJECT_LABEL_TO_CODE가 담당한다 — DB에는 코드값만 저장한다.';

COMMENT ON COLUMN "public"."goal_timer_sessions"."subject" IS '과목 코드 8종(korean/math/english/science/social/history/second_lang/etc). 한글 라벨(국어/수학/영어/탐구/사회/한국사/제2외국어/기타)과의 매핑은 api/_lib/goalRepo.ts SUBJECT_CODE_TO_LABEL/SUBJECT_LABEL_TO_CODE가 담당한다 — DB에는 코드값만 저장한다.';

-- ---------------------------------------------------------------------
-- 2) goal_timer_subjects — 학생별 타이머 화면 노출 과목(신규)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."goal_timer_subjects" (
    "profile_id" "uuid" NOT NULL REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE,
    "subject" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_timer_subjects_pkey" PRIMARY KEY ("profile_id", "subject"),
    CONSTRAINT "goal_timer_subjects_subject_check" CHECK (("subject" = ANY (ARRAY[
      'korean'::"text", 'math'::"text", 'english'::"text", 'science'::"text",
      'social'::"text", 'history'::"text", 'second_lang'::"text", 'etc'::"text"
    ])))
);

ALTER TABLE "public"."goal_timer_subjects" OWNER TO "postgres";

COMMENT ON TABLE "public"."goal_timer_subjects" IS '목표관리 열공 타이머(#25) 화면에 노출 중인 과목 목록(학생별, QA B9 "+ 과목 추가"). 행이 없으면 기본 4과목(math/korean/english/science)이 노출된 것으로 간주한다 — 기존 학생 백필 불필요. 첫 "+ 과목 추가" 시 서버(addTimerSubject, api/_lib/goalRepo.ts)가 기본 4개를 sort_order 0..3으로 먼저 물질화한 뒤 요청 과목을 다음 sort_order로 추가한다. 쓰기는 service_role(api/goal/timer.ts POST action=addSubject)만.';

COMMENT ON COLUMN "public"."goal_timer_subjects"."profile_id" IS 'goal_students.profile_id(≡auth.users.id). 소유자 판정은 언제나 세션 토큰에서 얻은 profileId로만 한다(api/_lib/goalRepo.ts openGoalSession 관례) — 클라이언트가 보낸 어떤 id도 신뢰하지 않는다.';

COMMENT ON COLUMN "public"."goal_timer_subjects"."subject" IS '과목 코드 8종 — goal_timer_sessions/goal_subject_targets/goal_plan_tasks와 동일 CHECK 도메인.';

COMMENT ON COLUMN "public"."goal_timer_subjects"."sort_order" IS '카드 표시 순서(오름차순). 기본 4과목은 0..3, 이후 추가한 과목은 뒤로 이어 붙는다.';

COMMENT ON COLUMN "public"."goal_timer_subjects"."created_at" IS '행 생성(카드 추가) 시각.';

ALTER TABLE "public"."goal_timer_subjects" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goal_timer_subjects_select_own" ON "public"."goal_timer_subjects" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));

CREATE POLICY "goal_timer_subjects_admin_select" ON "public"."goal_timer_subjects" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());

GRANT ALL ON TABLE "public"."goal_timer_subjects" TO "anon";
GRANT ALL ON TABLE "public"."goal_timer_subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_timer_subjects" TO "service_role";
