// 결제/신청 목록 표가 공유하는 표시 헬퍼 — 학생 신청 내역(PaymentsTab)과
// 학부모 결제 내역(parent/ParentPaymentsTab)이 같은 규칙을 써야 한다.
// 두 화면이 각자 구현하면 같은 주문이 서로 다른 배지·다른 주문번호로 보인다.

// 승인/신청 일시 YYYY/MM/DD.
export function formatApprovedAt(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${y}/${m}/${d}`;
}

// 표시용 주문번호 축약. 시안(9자리 숫자, 예: 123283945)은 그대로 두고, 실데이터의
// 토스 orderId(order_1785898468780_adf9e6aa, sql/10_pricing_orders.sql)처럼 긴 값만
// order_ 접두어를 떼고 뒤쪽 10자만 남겨 220px 컬럼을 넘지 않게 한다. 원본은 표의
// title 속성에 남아 hover 로 확인할 수 있다.
export function formatOrderId(id) {
  const raw = String(id || "");
  const stripped = raw.startsWith("order_") ? raw.slice("order_".length) : raw;
  if (stripped.length <= 12) return stripped;
  return `…${stripped.slice(-10)}`;
}

// order + 매칭되는 refund_requests 최신 행으로 상태 배지 키를 계산한다.
// refunds 는 상위(MyPage)가 created_at desc 로 정렬해 내려주므로 첫 매칭이 최신이다.
//
// refund_requests 는 축이 둘이다(sql/68) — status(어드민 처리축)와
// approval_status(학부모 승인축). 둘을 함께 보지 않으면 "학부모 확인 대기"와
// "어드민 처리 중"이 같은 배지로 뭉개진다.
export function resolveOrderStatus(order, refunds) {
  // 가상계좌 미입금(waiting_deposit)은 환불 대상이 아니므로 refunds 매칭보다 먼저
  // 본다 — 돈이 안 들어온 주문이라 refund_requests 행이 있을 수 없다.
  if (order.status === "waiting_deposit") return "pending";

  const refund = refunds.find((r) => r.order_id === order.id);
  if (!refund) return "paid";

  // 어드민 처리축이 종결된 건이 먼저다 — 제약상 이 두 값은 승인 이후에만
  // 나올 수 있다(refund_requests_approval_before_processing_check).
  if (refund.status === "completed") return "refund_completed";
  if (refund.status === "rejected") return "refund_rejected";

  if (refund.approval_status === "requested") return "refund_approval_pending";
  if (refund.approval_status === "rejected") return "refund_parent_rejected";

  return "refund_requested";
}
