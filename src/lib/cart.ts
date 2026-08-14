// 결제 선택 항목(장바구니) 유틸.
// Pricing 에서 선택한 상품을 sessionStorage 에 담고 Checkout 에서 읽는다.
// sessionStorage 를 쓰는 이유: 결제 페이지 새로고침에도 선택이 유지되고,
// 탭을 닫으면 자동으로 비워진다.
// v1 → v2 (2026-08-11): products.id 가 text('goal-3m')에서 uuid 대체키로 바뀌었다
// (sql/56_surrogate_uuid_keys.sql). 배포 시점에 이미 열려 있던 탭의
// sessionStorage 에는 `{id:'goal-3m'}` 형태의 구 장바구니가 남아 있고, 그대로
// /checkout 으로 넘어가면 api/create-order.js 의 products 조회(`.in('id', ids)`)가
// uuid 컬럼에 text 를 넣어 0건을 돌려주고 "판매 중이 아닌 상품이 포함되어
// 있습니다" 로 결제가 막힌다 — 사용자가 스스로 풀 방법이 없는 상태다.
// 키를 올리면 getCart() 가 없는 키를 읽어 [] 를 반환하므로 구 장바구니가 자동으로
// 무시된다(빈 주문서 = 정상 경로). 읽기 지점이 Checkout.jsx 두 줄뿐이라
// v1 을 읽어 변환하는 폴백 로직은 두지 않는다 — 구 id 로는 새 상품 행을 찾을
// 근거가 없고(slug 와 우연히 같은 값이라도 그건 서버가 신뢰하는 키가 아니다)
// 값을 지어내는 것보다 비우는 쪽이 안전하다.
const CART_KEY = "winning-cart-v2";

export function saveCart(items: unknown[]) {
  try {
    window.sessionStorage.setItem(
      CART_KEY,
      JSON.stringify(Array.isArray(items) ? items : []),
    );
  } catch {
    // 저장 실패는 무시 (프라이빗 모드 등)
  }
}

export function clearCart() {
  try {
    window.sessionStorage.removeItem(CART_KEY);
  } catch {
    // 무시
  }
}
