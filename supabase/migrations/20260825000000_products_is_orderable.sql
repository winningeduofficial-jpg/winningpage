-- 셀프서브 결제 카탈로그 화이트리스트를 DB 컬럼으로 이전한다. 배경 — ParentCheckout.tsx와
-- StudentEnrollmentRequest.tsx가 각각 ALLOWED_SERVICE_KEYS 라는 프론트 하드코딩 상수를
-- 중복 보유해오다 드리프트로 diagnose 서비스가 한쪽에서 누락되어 결제가 막히는 버그가
-- 났다. is_active(판매 중 여부)와는 별개 축이다 — is_active=false는 상품 자체를 숨기고,
-- is_orderable=false는 카탈로그에는 계속 보이되(예: 상담 전용/오프라인 전용 상품) 학생
-- 수강신청·학부모 결제 같은 셀프서브 주문 흐름에서만 제외한다. 기본값 true라 기존 상품은
-- 마이그레이션 직후 전부 주문 가능 상태를 유지한다.
ALTER TABLE "public"."products"
  ADD COLUMN IF NOT EXISTS "is_orderable" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN "public"."products"."is_orderable" IS '셀프서브 결제 플로우(학생 수강신청 StudentEnrollmentRequest.tsx / 학부모 결제 ParentCheckout.tsx)에서 노출·주문 허용 여부. is_active(판매 중 여부)와 별개 축 — false여도 다른 화면(PricingSelling.tsx 등)에는 계속 보일 수 있다. 프론트 ALLOWED_SERVICE_KEYS 하드코딩 상수를 대체한다(2026-08-25).';
