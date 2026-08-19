// 결제/신청 목록 표가 공유하는 표시 헬퍼 — 학생 신청 내역(PaymentsTab)과
// 학부모 결제 내역(parent/ParentPaymentsTab)이 같은 규칙을 써야 한다.
// 두 화면이 각자 구현하면 같은 주문이 서로 다른 배지·다른 주문번호로 보인다.

type OrderStatusInput = {
  id?: string;
  status?: string | null;
  approval_status?: string | null;
};

type RefundStatusInput = {
  order_id?: string;
  status?: string | null;
  approval_status?: string | null;
};

// 승인/신청 일시 YYYY/MM/DD.
export function formatApprovedAt(
  value: string | number | Date | null | undefined,
) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${y}/${m}/${d}`;
}

// 표시용 주문번호. 실데이터의 토스 orderId(order_1785898468780_adf9e6aa,
// sql/10_pricing_orders.sql)에서 order_ 접두어만 뗀 전체 값을 그대로 보여준다
// (축약·말줄임 없음 — 주문번호 칼럼은 전체가 보이도록 폭을 맞춘다).
export function formatOrderId(id: string | number | null | undefined) {
  const raw = String(id || "");
  return raw.startsWith("order_") ? raw.slice("order_".length) : raw;
}

// 표시용 상품명 — 여러 상품이 담긴 주문도 order_name(대표 상품명 + "외 N건" 요약)
// 대신 order_items 전체를 ", "로 나열한다. order_items 조인이 없는 호출부(옛
// 쿼리, 아직 안 옮긴 화면)를 위해 order_name 폴백을 남겨 둔다.
export function formatProductNames(order: {
  order_name?: string | null;
  order_items?: { name: string }[] | null;
}) {
  if (order.order_items && order.order_items.length > 0) {
    return order.order_items.map((item) => item.name).join(", ");
  }
  return order.order_name || "";
}

// order + 매칭되는 refund_requests 최신 행으로 상태 배지 키를 계산한다.
// refunds 는 상위(MyPage)가 created_at desc 로 정렬해 내려주므로 첫 매칭이 최신이다.
//
// refund_requests 는 축이 둘이다(sql/68) — status(어드민 처리축)와
// approval_status(학부모 승인축). 둘을 함께 보지 않으면 "학부모 확인 대기"와
// "어드민 처리 중"이 같은 배지로 뭉개진다.
export function resolveOrderStatus(
  order: OrderStatusInput,
  refunds: RefundStatusInput[],
) {
  // 학부모가 다른 상품 구성으로 새로 결제해 이 주문을 대체함
  // (fn_parent_create_enrollment). 반려가 아니라 대체라 환불 대상이 아니고,
  // waiting_deposit 체크보다도 먼저 봐야 한다 — 그래야 어떤 경우에도 환불
  // 매칭이나 다른 상태로 오분류되지 않는다.
  if (order.approval_status === "superseded") return "superseded";

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
