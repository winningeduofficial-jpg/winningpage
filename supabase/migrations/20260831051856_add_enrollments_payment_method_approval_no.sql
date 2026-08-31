-- QA 행272·227: 수강 신청 내역 목록에 결제방식/승인번호 컬럼을 노출하기 위해
-- enrollments 테이블에 두 컬럼을 추가한다. 기존 행은 값이 없으므로 nullable.
ALTER TABLE "public"."enrollments"
  ADD COLUMN IF NOT EXISTS "payment_method" "text",
  ADD COLUMN IF NOT EXISTS "approval_no" "text";
