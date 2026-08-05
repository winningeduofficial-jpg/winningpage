// 가격 표시 유틸 (가격 데이터 없음)
// ------------------------------------------------------------------
// 이 파일에는 상품/가격/쿠폰 데이터가 없다. 가격의 유일한 신뢰 소스는
// Supabase `products`(상품/가격) · `coupons`(쿠폰) 테이블이며, 서버
// (api/create-order)가 DB 가격으로 결제 금액을 재계산한다.
// 프론트에서 상품/가격을 조회하려면 src/lib/products.js(fetchProducts,
// useProducts)를 사용할 것 — 이 파일에 폴백 데이터를 되살리지 말 것.

// 단일 선택 안내 문구 (플랜이 2개 이상인 서비스 하단)
export const SINGLE_SELECT_NOTICE =
  '한 서비스 내에서 여러 플랜을 동시 선택할 수 없어요. 하나의 플랜만 선택 가능합니다.';

export function formatKRW(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}
