-- 프리미엄(A 프로그램) 랜딩 "실적으로 증명하는 실력" pill 목록용 테이블.
-- 기존 university_acceptances 테이블/정책 패턴을 그대로 따른다
-- (supabase/migrations/20260821000000_baseline.sql 7421~7432, 10113~10120행 참고).

CREATE TABLE IF NOT EXISTS "public"."premium_achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "count" integer NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "premium_achievements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."premium_achievements" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "premium_achievements_active_idx" ON "public"."premium_achievements" USING "btree" ("is_active");

CREATE INDEX IF NOT EXISTS "premium_achievements_sort_order_idx" ON "public"."premium_achievements" USING "btree" ("sort_order");

ALTER TABLE "public"."premium_achievements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "premium_achievements admin write" ON "public"."premium_achievements" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());

CREATE POLICY "premium_achievements public read" ON "public"."premium_achievements" FOR SELECT USING (("is_active" = true));

INSERT INTO "public"."premium_achievements" ("label", "count", "sort_order", "is_active") VALUES
    ('서연고', 37, 1, true),
    ('메디컬', 34, 2, true),
    ('서성한', 43, 3, true),
    ('과기원', 22, 4, true),
    ('미대', 7, 5, true);

-- 신규 전용 라우트(/page/premium-a)가 이 콘텐츠를 대체하므로 기존
-- page_contents 동적 페이지는 비활성화한다. DynamicPage.tsx는
-- .eq("is_active", true)로 조회하므로 이 UPDATE만으로 일반 동적 라우트
-- 조회에서는 걸러진다 — 단, /page/:slug 캐치올보다 먼저 전용 라우트가
-- 등록돼 있어야 실제로 새 페이지가 보인다(라우트 조립은 별도 작업 소관).
UPDATE "public"."page_contents" SET "is_active" = false WHERE "slug" = 'premium-a';

-- 어드민 권한 시스템(20260822000010_admin_permissions.sql)에 새 화면을 등록.
-- '메인 관리' 그룹, mentorStrategies(60)와 pageContents(70) 사이.
INSERT INTO "public"."admin_resources" ("key", "group_title", "label", "sort_order") VALUES
    ('premiumAchievements', '메인 관리', '프리미엄 실적 뱃지', 65)
ON CONFLICT ("key") DO UPDATE
    SET "group_title" = EXCLUDED."group_title",
        "label" = EXCLUDED."label",
        "sort_order" = EXCLUDED."sort_order",
        "is_active" = true;
