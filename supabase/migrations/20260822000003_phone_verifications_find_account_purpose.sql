-- 아이디(이메일) 찾기(QA 지시 2026-08-21) — 로그인 화면 신규 "아이디 찾기" 플로우가
-- 기존 /api/send-phone-code · /api/verify-phone-code를 그대로 재사용해 휴대폰
-- 인증을 받는다. purpose='find_account'로 발송하므로 phone_verifications의
-- purpose CHECK 허용 목록에 추가해야 insert가 통과한다(그 외 signup/parent_signup/
-- phone_change/mentor_apply 값은 baseline 그대로 유지).
--
-- 이 purpose는 api/send-phone-code.ts의 SIGNUP_PURPOSES에 넣지 않는다 — 계정이
-- '이미 있어야' 정상 시나리오이므로 isPhoneTaken 중복 차단을 걸면 안 된다
-- (mentor_apply와 같은 이유, send-phone-code.ts 상단 주석 참고).
ALTER TABLE "public"."phone_verifications"
  DROP CONSTRAINT "phone_verifications_purpose_check";

ALTER TABLE "public"."phone_verifications"
  ADD CONSTRAINT "phone_verifications_purpose_check"
  CHECK (("purpose" = ANY (ARRAY[
    'signup'::"text",
    'parent_signup'::"text",
    'phone_change'::"text",
    'mentor_apply'::"text",
    'find_account'::"text"
  ])));
