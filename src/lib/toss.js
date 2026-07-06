import { loadTossPayments, ANONYMOUS } from '@tosspayments/tosspayments-sdk';

// 발급받은 클라이언트 키. (.env 의 VITE_TOSS_CLIENT_KEY / Vercel 환경변수)
export const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY;

// 비회원 결제용 상수. 회원이면 로그인한 사용자 고유값(user.id 등)을 customerKey 로 넘긴다.
export { ANONYMOUS };

// SDK 인스턴스를 한 번만 로드해서 재사용.
let tossPromise;
export function getTossPayments() {
  if (!TOSS_CLIENT_KEY) {
    console.warn('VITE_TOSS_CLIENT_KEY 환경변수가 설정되지 않았습니다.');
  }
  if (!tossPromise) {
    tossPromise = loadTossPayments(TOSS_CLIENT_KEY);
  }
  return tossPromise;
}

// 데모용 주문번호 생성기 (실서비스에서는 서버에서 생성/저장하는 것을 권장).
export function createOrderId() {
  return `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
