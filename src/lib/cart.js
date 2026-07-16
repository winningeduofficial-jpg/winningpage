// 결제 선택 항목(장바구니) 유틸.
// Pricing 에서 선택한 상품을 sessionStorage 에 담고 Checkout 에서 읽는다.
// sessionStorage 를 쓰는 이유: 결제 페이지 새로고침에도 선택이 유지되고,
// 탭을 닫으면 자동으로 비워진다.
const CART_KEY = 'winning-cart-v1';

// 저장 형태: [{ id, serviceKey, serviceName, serviceDesc, name, listPrice, price, badge, recommended }]
export function getCart() {
  try {
    const raw = window.sessionStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCart(items) {
  try {
    window.sessionStorage.setItem(CART_KEY, JSON.stringify(Array.isArray(items) ? items : []));
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
