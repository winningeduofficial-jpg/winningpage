-- =====================================================================
-- 87_coupon_redemptions_pair_select.sql
-- 학부모 마이페이지 결제요청 확인 모달(EnrollmentRequestModal)과 결제
-- 상세 내역 모달(PaymentDetailModal)이 "할인 금액"(상품 할인)과 "쿠폰"을
-- 따로 보여줘야 하는데, orders.discount_amount 는 상품 할인 + 쿠폰 할인의
-- 합(sql/55_coupon_policy.sql:182-193 불변식)이라 이 값만으로는 분해가
-- 안 된다. 쿠폰 할인 정본은 coupon_redemptions(voided_at is null 행의
-- discount_amount 합)이라 클라이언트가 그걸 따로 읽어 orders.discount_
-- amount 에서 빼는 방식으로 상품 할인을 역산한다.
--
-- 그런데 지금 coupon_redemptions RLS 는 "select own"(auth.uid()=user_id)
-- 하나뿐이다(sql/55). user_id 는 그 쿠폰이 귀속된 소유자(granted 는 학생
-- 또는 학부모 중 한쪽, auto 는 항상 NULL — sql/86 60-63행 주석과 동일
-- 축)라, 학부모가 자녀(학생) 소유로 귀속된 redemption 이나 auto 쿠폰의
-- redemption(user_id NULL, own 정책 자체가 매칭 안 됨)을 못 읽는다. 그
-- 결과 결제 요청이 학생 소유 쿠폰으로 이뤄졌으면 학부모 화면에서 쿠폰
-- 행이 통째로 빠지거나 0원으로 보인다.
--
-- orders RLS("orders select own", sql/68_enrollment_request_pair.sql
-- 151-154행: auth.uid() in (student_profile_id, parent_profile_id) or
-- is_admin())가 이미 쌍 당사자 모두에게 그 주문을 열어주므로, 그 주문에
-- 물린 coupon_redemptions 도 같은 축(주문의 학생·학부모·user_id)으로
-- 열어주는 신규 정책을 "select own" 과 별도로 추가한다(기존 정책은
-- drop 하지 않는다 — service_role/RPC 이 아닌 일반 조회 경로로 자기
-- redemption 을 보는 다른 화면이 이미 그 정책에 의존하고 있을 수 있어
-- 축소 없이 순수 추가만 한다).
--
-- 노출 컬럼: select 정책이라 테이블 전 컬럼이 대상이지만
-- coupon_redemptions 에는 쿠폰 id·주문 id·소유자 id·할인액·void 사유
-- 뿐 민감정보(결제수단·개인정보)가 없다(sql/55 464-478행 컬럼 정의).
--
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- 이 파일이 하지 않는 것 (명시적 제외)
-- ---------------------------------------------------------------------
--   · 기존 "coupon_redemptions select own" 정책 변경/삭제 — 그대로 둔다.
--   · 클라이언트 배선 — useMyPageOrders.ts / ParentPaymentsTab.tsx 의
--     select 문에 coupon_redemptions(discount_amount, voided_at) 를
--     얹고 EnrollmentRequestModal.tsx / PaymentDetailModal.tsx 에 조건부
--     행을 추가하는 건 같은 작업의 별도 커밋(코드 변경, sql 아님).
--   · DB 적용 — 파일만 쓴다. 적용·검증은 팀 리드가 한다.
-- =====================================================================


-- =====================================================================
-- 1) coupon_redemptions select 정책 추가 — 주문 쌍 당사자 축.
-- =====================================================================
drop policy if exists "coupon_redemptions select pair" on public.coupon_redemptions;
create policy "coupon_redemptions select pair" on public.coupon_redemptions
  for select using (
    exists (
      select 1 from public.orders o
       where o.id = coupon_redemptions.order_id
         and (o.user_id = auth.uid()
           or o.student_profile_id = auth.uid()
           or o.parent_profile_id = auth.uid())
    )
  );


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) 학부모 JWT — 자녀 소유 쿠폰이 확정된 주문의 redemption 조회.
--   -- fn_respond_enrollment(..., true, null, array[coupon_id]) 로 승인해
--   -- 학생 소유(granted) 쿠폰이 확정된 주문(coupon_redemptions.user_id =
--   -- 학생 profile id)에 대해, 그 주문의 parent_profile_id 로 로그인한
--   -- 학부모 JWT 로 `select * from coupon_redemptions where order_id =
--   -- '<그 order_id>'` 조회 → 1행 이상(own 정책은 매칭 안 되지만 pair
--   -- 정책이 열어준다).
--
-- V2) 무관한 제3자 JWT — 0행.
--   -- 그 주문의 학생·학부모 어느 쪽도 아닌 제3의 학부모/학생 JWT 로 같은
--   -- 조회 → 0행(own·pair 정책 둘 다 매칭 안 됨).
--
-- V3) 기존 own 정책 회귀 없음.
--   -- 쿠폰을 직접 귀속받은 본인(auth.uid()=coupon_redemptions.user_id)
--   -- JWT 로 자기 redemption 조회 → 여전히 1행 이상(own 정책이 그대로
--   -- 매칭, pair 정책은 신규 추가라 서로 방해하지 않음 — RLS 정책은
--   -- OR 로 합쳐진다).
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- 2026-08-19 dev(gjowqdiopinhixfivnkx)·prod(ykrpjcsubmbenfcnwlzd) 적용
-- 완료(Management API database/query). 양쪽 모두 pg_policy 에
-- "coupon_redemptions select pair" 생성 확인, 기존 3개 정책(own/admin
-- select/admin update)은 그대로다.
-- =====================================================================
