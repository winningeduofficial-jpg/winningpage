-- 비밀번호 찾기의 휴대폰 인증 경로(QA 시트 147·209행, 2026-09-02) —
-- /api/reset-password-by-phone이 purpose='reset_password'로 인증 상태를
-- 조회한다. 20260822000003(find_account 추가)과 동일한 이유로 phone_verifications
-- 의 purpose CHECK 허용 목록에 추가해야 /api/send-phone-code의 insert가 통과한다.
--
-- 이 purpose도 api/send-phone-code.ts의 SIGNUP_PURPOSES에 넣지 않는다 —
-- find_account와 동일하게 계정이 '이미 있어야' 정상 시나리오다.
ALTER TABLE "public"."phone_verifications"
  DROP CONSTRAINT "phone_verifications_purpose_check";

ALTER TABLE "public"."phone_verifications"
  ADD CONSTRAINT "phone_verifications_purpose_check"
  CHECK (("purpose" = ANY (ARRAY[
    'signup'::"text",
    'parent_signup'::"text",
    'phone_change'::"text",
    'mentor_apply'::"text",
    'find_account'::"text",
    'reset_password'::"text"
  ])));
