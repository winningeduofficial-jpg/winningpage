-- 회원구분 코드(QA #3) — 관리자가 "일반회원" 외에 "OO학교"/"OO기관"/"OO캠퍼스"/
-- "OO기업"/"기타" 등을 자유롭게 표기하는 관리자 전용 라벨이다. CHECK 제약을
-- 두지 않는 이유는 표기 자체가 관리자 재량의 자유 텍스트이기 때문(사용자 확정).
-- 일반 회원 화면에는 렌더하지 않는다 — 그 보장은 프론트(ProfileTab 등이 이
-- 컬럼을 아예 select/표시하지 않는 것)의 책임이고, select 노출 자체는 무해하다.
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "member_category" "text" DEFAULT '일반회원'::"text";

COMMENT ON COLUMN "public"."profiles"."member_category" IS '관리자 전용 회원구분 라벨(QA #3, 2026-08-22). 기본값 "일반회원", 그 외 "OO학교"/"OO기관"/"OO캠퍼스"/"OO기업"/"기타" 등은 관리자가 자유 텍스트로 기입한다 — CHECK 없음(고정 목록이 아니라 관리자 재량). 일반 회원 화면에는 노출하지 않는다(회원구분 관리 화면 전용).';
