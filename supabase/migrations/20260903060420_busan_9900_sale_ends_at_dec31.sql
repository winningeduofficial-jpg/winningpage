-- 부산캠퍼스 특가(busan-9900) 판매 마감 연장 — 2026-09-03 사용자 확정
--
-- 20260901050445_busan_9900_bundle_seed 가 심은 마감 2026-09-30 24:00 KST 를
-- 2026-12-31 24:00 KST(= 2027-01-01 00:00 KST = 2026-12-31T15:00:00Z)로 옮긴다.
-- 마감 이후 동작은 기존 축 그대로다 — 카탈로그·결제요청·학부모 결제 화면은
-- filterOrgProducts(src/lib/products.ts)가 숨기고, fn_request_enrollment ·
-- fn_parent_create_enrollment 는 WC065 로 거부한다. 지난 시드 마이그레이션은
-- 이미 적용된 이력이라 손대지 않고 UPDATE 로 덮는다(재생 DB 에서도 시드 뒤에
-- 이 파일이 실행되므로 최종값은 동일).

update public.products
   set sale_ends_at = '2026-12-31T15:00:00Z'::timestamptz
 where slug = 'busan-9900';
