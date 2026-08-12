# 마이페이지 결제요청 인수 명세 (2026-08-12)

## 전제
- dev 에 sql/68~71 적용·병합 완료(PR #59), 결제 플로우 배선 병합 완료(PR #60).
- 학생이 결제요청을 만들고(주문 status='pending', approval_status='requested', user_id=학부모, student_profile_id=학생), 학부모가 /checkout?order=<id> 에서 수락+쿠폰+토스 결제한다. ParentCheckout 이 이미 구현돼 있다 — 마이페이지는 "발견 경로"만 만들면 된다.

## 작업 1 — 학부모 결제요청 인박스
```js
const { data } = await supabase
  .from('orders')
  .select('id, order_name, amount, discount_amount, status, approval_status, student_profile_id, created_at')
  .eq('parent_profile_id', session.user.id)
  .eq('status', 'pending')
  .eq('approval_status', 'requested')
  .order('created_at', { ascending: false });
```
- 각 행에 /checkout?order=<id> 링크.
- 주의: MyPage.jsx 의 FAKE_ENTITLEMENT_ENABLED 가짜 주문이 인박스에 새지 않게 동일 필터 원칙 적용 (기존 refundableOrders 필터 참고).

## 작업 2 — 결제 재개 (설계 갭, 반드시 처리)
- 학부모가 수락(fn_respond_enrollment 성공) 후 토스창만 닫으면 주문이 approval_status='approved' && status='pending' 으로 남는다. 현재 ParentCheckout 진입 게이트는 requested+pending 만 통과 — 재개 경로가 없다.
- 인박스에 approved+pending 도 "결제 대기" 로 노출하고, ParentCheckout 쪽에 재개 모드(쿠폰 재선택 없이 기존 amount 로 토스 재호출)가 필요하다. ParentCheckout 수정은 결제 플로우 담당과 조율할 것.

## 작업 3 — 학생 주문 목록 축
```js
.from('orders').select('id, order_name, amount, status, approval_status, created_at')
.eq('student_profile_id', session.user.id)
```
- 상태 표시: requested=요청중(학부모 확인 대기) / approved+pending=결제 진행 대기 / paid / canceled / refunded.
- 기존 조회(.eq('user_id', ...))는 학부모 축이라 학생에겐 빈 목록 — 학생 로그인 시 이 축으로.
- order_items 는 RLS 가 orders 축으로 열려 있어 학생 본인 주문 상세 조회 가능.

## 작업 4 — 학생 환불 신청의 학부모 승인 UI
```js
// 대기 목록
.from('refund_requests').select('id, order_id, amount, reason, status, approval_status, created_at')
.eq('parent_profile_id', session.user.id).eq('approval_status', 'requested')

// 응답 — 반드시 클라이언트(학부모 JWT) rpc. RETURNS refund_requests 단일 객체.
supabase.rpc('fn_respond_refund', {
  p_refund_request_id,  // bigint
  p_approve,            // boolean
  p_reject_reason,      // 반려 시 필수, 승인 시 null
});
```
- 에러 매핑: WC026 없음 / WC027 학부모 아님 / WC028 이미 응답됨 / WC029 반려 사유 필수.
- 반려되면 학생이 같은 주문으로 재신청 가능(설계 확정). status(어드민 처리축)는 이 함수가 건드리지 않는다.

## 공통 계약
- fn_respond_enrollment 는 RETURNS TABLE 전환 — rpc 반환이 1행짜리 배열, data[0] 접근. 컬럼: order_id/status/approval_status/amount/discount_amount/applied_coupon_ids/skipped_coupon_ids.
- 에러 안내는 raise 문구 키워드(order_not_pending 등) 우선 매핑, DB 원문을 화면에 노출하지 않는다.
- 신규 사용자 노출 한국어 문구는 도입 전 승인 필요.
- 이 파일은 docs/ 관례상 커밋하지 않는다.
