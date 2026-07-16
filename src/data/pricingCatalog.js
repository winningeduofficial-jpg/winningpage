// 결제 상품 카탈로그 (프런트 폴백 데이터)
// ------------------------------------------------------------------
// 실제 가격/금액의 신뢰 소스는 Supabase `products` 테이블이며,
// 서버(api/create-order)가 DB 가격으로 결제 금액을 재계산한다.
// 이 파일은 (1) 마이그레이션 전/네트워크 지연 시 UI 렌더용 폴백,
// (2) products 시드의 원본 역할을 한다. DB와 이 파일을 함께 갱신할 것.
//
// 필드
//   id            : 상품 고유 키 (products.id 와 동일, 서버 재계산의 기준)
//   name          : 표시 이름 (예: "[1개월] 위닝 목표관리")
//   listPrice     : 정가(할인 전)
//   price         : 실제 결제가(할인 적용 후)
//   badge         : 할인 라벨 (예: "10% 할인"), 없으면 null
//   recommended   : "추천" 뱃지 여부

export const SERVICES = [
  {
    key: 'goal',
    name: '위닝 목표관리',
    desc: '목표관리서비스는 단순히 희망 대학을 적는 기능이 아니라, 학생의 현재 성적, 학습 습관, 수행평가 흐름, 학생부 방향을 함께 분석하여 목표 달성 가능성을 높이는 관리 체계입니다.',
    products: [
      { id: 'goal-1m', name: '[1개월] 위닝 목표관리', listPrice: 30000, price: 30000, badge: null, recommended: false },
      { id: 'goal-3m', name: '[3개월] 위닝 목표관리', listPrice: 90000, price: 81000, badge: '10% 할인', recommended: false },
      { id: 'goal-6m', name: '[6개월] 위닝 목표관리', listPrice: 180000, price: 144000, badge: '20% 할인', recommended: false },
      { id: 'goal-12m', name: '[12개월] 위닝 목표관리', listPrice: 360000, price: 252000, badge: '30% 할인', recommended: true },
    ],
  },
  {
    key: 'susi',
    name: '위닝 수시예측',
    desc: '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.',
    products: [
      { id: 'susi-1', name: '[1회 이용권] 위닝 수시예측', listPrice: 30000, price: 30000, badge: null, recommended: false },
      { id: 'susi-2', name: '[2회 이용권] 위닝 수시예측', listPrice: 60000, price: 55000, badge: '약 8% 할인', recommended: false },
      // 디자인 시안에는 이 항목 이름이 "위닝 AI수행평가"로 표기돼 있으나(복붙 오류로 추정),
      // 섹션 성격상 "위닝 수시예측"으로 정정. 필요 시 name 만 바꾸면 된다.
      { id: 'susi-30', name: '[12개월 30회 이용권] 위닝 수시예측', listPrice: 90000, price: 80000, badge: '약 11% 할인', recommended: true },
    ],
  },
  {
    key: 'mentor',
    name: '위닝 콜멘토',
    desc: '검증된 위닝에듀 멘토와 전화 상담을 진행하는 서비스입니다.',
    products: [
      { id: 'mentor-1', name: '[이용권] 콜멘토', listPrice: 50000, price: 50000, badge: null, recommended: false },
    ],
  },
  {
    key: 'suhaeng',
    name: '위닝 AI수행평가',
    desc: 'AI 수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.',
    products: [
      { id: 'suhaeng-1', name: '[1회 이용권] 위닝 AI수행평가', listPrice: 4900, price: 4900, badge: null, recommended: false },
      { id: 'suhaeng-2', name: '[1개월 2회] 위닝 AI수행평가', listPrice: 9000, price: 9000, badge: null, recommended: false },
      { id: 'suhaeng-6', name: '[3개월 6회 이용권] 위닝 AI수행평가', listPrice: 26667, price: 24000, badge: '10% 할인', recommended: false },
      { id: 'suhaeng-14', name: '[6개월 14회 이용권] 위닝 AI수행평가', listPrice: 54000, price: 43200, badge: '20% 할인', recommended: false },
      { id: 'suhaeng-30', name: '[12개월 30회 이용권] 위닝 AI수행평가', listPrice: 108000, price: 75600, badge: '30% 할인', recommended: true },
    ],
  },
];

// 쿠폰 폴백 (신뢰 소스는 Supabase `coupons`). 서버가 최종 검증한다.
export const COUPONS = [
  { id: 'signup-6000', title: '회원가입 특별할인', discount: 6000, minAmount: 0, validUntil: '2026-08-15' },
  { id: 'over200k-5000', title: '20만원 이상 구매 시 5,000원 할인', discount: 5000, minAmount: 200000, validUntil: '2026-08-15' },
];

// 단일 선택 안내 문구 (플랜이 2개 이상인 서비스 하단)
export const SINGLE_SELECT_NOTICE =
  '한 서비스 내에서 여러 플랜을 동시 선택할 수 없어요. 하나의 플랜만 선택 가능합니다.';

const PRODUCT_INDEX = new Map();
SERVICES.forEach((service) => {
  service.products.forEach((product) => {
    PRODUCT_INDEX.set(product.id, { ...product, serviceKey: service.key, serviceName: service.name, serviceDesc: service.desc });
  });
});

// id 로 상품(+서비스 정보) 조회
export function findProduct(id) {
  return PRODUCT_INDEX.get(id) || null;
}

export function findCoupon(id) {
  return COUPONS.find((c) => c.id === id) || null;
}

export function formatKRW(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}
