// 로컬 QA 전용 "이용권(유료 결제) 보유" 가정 플래그.
// 사용법: .env.local에 VITE_FAKE_ENTITLEMENT=true 를 추가하고 개발 서버를 재시작한다.
// import.meta.env.DEV를 반드시 함께 검사한다 — 프로덕션 빌드는 항상 DEV=false이므로,
// 이 값이 실수로 환경변수에 들어가도(Vercel 등) 프로덕션 번들에서는 활성화가 절대 불가능하다.
// 플래그 단독으로 판정하면 그 안전장치가 사라진다.
//
// 서버(api/create-service-ticket.js의 hasPaidServiceAccess())는 이 플래그를 전혀 모른다.
// 여기는 프런트 표시 전용이며, 실제 결제 게이트 우회는 src/lib/paidServiceAccess.js의
// VITE_DISABLE_PAID_GATE가 담당한다. 두 플래그는 역할이 다르다(.env.example 참고).
export const FAKE_ENTITLEMENT_ENABLED =
  import.meta.env.DEV === true && import.meta.env.VITE_FAKE_ENTITLEMENT === 'true';

// MyPage.jsx가 orders 테이블에서 읽는 컬럼(id, order_name, amount, paid_at)과
// 형태를 맞춘 가짜 결제 내역. id는 실제 UUID와 절대 혼동되지 않도록 'dev-fake-' 접두어를 쓴다
// (submitRefund가 이 id로 refund_requests.order_id를 채우는 경로에 실수로 흘러들면
// DB에 존재하지 않는 order_id가 저장되므로, 호출부는 반드시 이 항목들을 환불 대상에서
// 제외해야 한다 — is_fake_entitlement 플래그로 구분한다).
export function getMockPaidOrders() {
  const now = new Date().toISOString();

  return [
    {
      id: 'dev-fake-goal-12m',
      order_name: '[12개월] 위닝 목표관리',
      amount: 252000,
      paid_at: now,
      is_fake_entitlement: true
    },
    {
      id: 'dev-fake-suhaeng-6',
      order_name: '[3개월 6회 이용권] 위닝 AI수행평가',
      amount: 24000,
      paid_at: now,
      is_fake_entitlement: true
    }
  ];
}

// 향후 /app/* 접근 가드가 쓸 판정 헬퍼.
// 계약: 플래그가 켜져 있으면 무조건 true(로컬에서 이용권을 가진 것으로 간주).
// 플래그가 꺼져 있으면 이 모듈은 아직 실제 판정 로직이 없으므로 null(판정 불가)을
// 반환한다 — false가 아니다. 호출부는 null을 받으면 "이용권 없음"으로 단정하지 말고
// 서버 판정(api/create-service-ticket.js의 hasPaidServiceAccess() 등)에 위임해야 한다.
export function hasEntitlement(serviceKey) {
  if (FAKE_ENTITLEMENT_ENABLED) return true;
  void serviceKey;
  return null;
}
