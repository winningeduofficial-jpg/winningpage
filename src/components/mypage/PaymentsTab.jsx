import { Fragment, useState } from 'react';
import { formatKRW } from '../../data/pricingCatalog';
import PaymentStatusBadge from './PaymentStatusBadge';
import PaymentDetailModal from './PaymentDetailModal';
import ReceiptModal from './ReceiptModal';
import RefundRequestModal from './RefundRequestModal';
import RefundNoticeModal from './RefundNoticeModal';

// 결제/환불 내역 탭 (Figma 3661:4082 표 + 모달 4종).
//
// 시안 플로우 — 주문번호 클릭
//   → 결제 상세 내역(3665:6278, PaymentDetailModal)
//       → [영수증 보기] → 결제 영수증(3665:6975, ReceiptModal)
//       → [환불 신청]   → 환불 신청(3665:6635, RefundRequestModal)
//                          → 접수 완료(3665:6730, RefundNoticeModal)
//
// 2026-08-13 이전에는 이 체인이 없었다: 주문번호를 누르면 영수증이 바로 떴고,
// 환불은 표 아래 접히는 자체 폼(주문 select + 사유 textarea + 은행/계좌/예금주)
// 이었다. 그 폼을 걷어내고 시안 모달로 옮겼다 — 환불 신청 자체의 서버 계약
// (fn_request_refund RPC)은 그대로이고, 금액만 서버 산정(제33조,
// sql/72_refund_policy_calc.sql)으로 바뀌었다.
//
// 로컬 QA 전용 가짜 이용권 주문(is_fake_entitlement)은 환불 진입을 막는다 —
// 존재하지 않는 order_id 로 RPC 를 호출하면 WC005 만 보게 된다.

// 승인 일시 YYYY/MM/DD 포맷.
function formatApprovedAt(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (!y || !m || !d) return raw;
  return `${y}/${m}/${d}`;
}

// 표시용 주문번호 축약. 시안(9자리 숫자, 예: 123283945)은 그대로 두고, 실데이터의
// 토스 orderId(order_1785898468780_adf9e6aa, sql/10_pricing_orders.sql)처럼 긴 값만
// order_ 접두어를 떼고 뒤쪽 10자만 남겨 220px 컬럼을 넘지 않게 한다. 원본은 title 속성에
// 그대로 남아 있으므로(아래 버튼) hover로 전체 값을 확인할 수 있다.
function formatOrderId(id) {
  const raw = String(id || '');
  const stripped = raw.startsWith('order_') ? raw.slice('order_'.length) : raw;
  if (stripped.length <= 12) return stripped;
  return `…${stripped.slice(-10)}`;
}

// order + 매칭되는 refund_requests 최신 행으로 표에 보여줄 상태를 계산한다.
// refunds는 상위(MyPage)에서 created_at desc로 정렬해 내려주므로 첫 매칭이 최신 건이다.
function resolveStatus(order, refunds) {
  // 가상계좌 미입금(waiting_deposit)은 환불 신청 대상이 아니므로 refunds 매칭보다 먼저
  // 본다 — 돈이 안 들어온 주문이라 refund_requests 행이 있을 수 없다(PaymentStatusBadge의
  // pending = 시안 "입금대기").
  if (order.status === 'waiting_deposit') return 'pending';
  const refund = refunds.find((r) => r.order_id === order.id);
  if (!refund) return 'paid';

  // 어드민 처리축(status)이 종결된 건이 먼저다 — 제약상 이 두 값은 승인
  // 이후에만 나올 수 있다(refund_requests_approval_before_processing_check).
  if (refund.status === 'completed') return 'refund_completed';
  if (refund.status === 'rejected') return 'refund_rejected';

  // 여기부터 status 는 requested/processing 이다. 승인축을 봐야 "누구를
  // 기다리는 중인지"가 갈린다 — 이걸 안 보면 학부모 응답 대기와 어드민
  // 처리 중이 같은 배지로 뭉개진다(2026-08-13 수정 전 동작).
  if (refund.approval_status === 'requested') return 'refund_approval_pending';
  if (refund.approval_status === 'rejected') return 'refund_parent_rejected';

  return 'refund_requested';
}

export default function PaymentsTab({ orders = [], refunds = [], onRefundSubmitted }) {
  const [detailOrder, setDetailOrder] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [refundOrder, setRefundOrder] = useState(null);
  const [noticeOpen, setNoticeOpen] = useState(false);

  const detailStatus = detailOrder ? resolveStatus(detailOrder, refunds) : null;

  function handleRequestRefund() {
    const target = detailOrder;
    setDetailOrder(null);
    if (target?.is_fake_entitlement) return;
    setRefundOrder(target);
  }

  function handleViewReceipt() {
    const target = detailOrder;
    setDetailOrder(null);
    setReceiptOrder(target);
  }

  function handleRefundSubmitted() {
    setRefundOrder(null);
    setNoticeOpen(true);
    onRefundSubmitted?.();
  }

  return (
    <section>
      <h2 className="text-[1.5rem] font-semibold text-ink">결제내역</h2>

      {orders.length === 0 ? (
        <p className="mt-6 rounded-lg border border-line bg-surface-04 px-5 py-6 text-center text-sm text-ink-sub">
          결제 내역이 없습니다.
        </p>
      ) : (
        // 콘텐츠 폭(최대 1100px, MyPage.jsx maxWidth)을 표가 강제로 넘기지 않도록 w-full 기반
        // 그리드로 구성한다. 컬럼폭은 시안 실측(주문번호/승인일시 각 220px, 금액/상태는 우측
        // 정렬 배지 폭에 맞춘 고정폭)을 기준으로 하되, 상품만 minmax(0,1fr)로 남는 폭을
        // 채운다 — 바깥 1fr은 grid item의 기본 최소폭(min-content)이 긴 상품명에서 열 합이
        // 컨테이너를 넘겨 배지를 잘라내므로, min을 0으로 강제해 실제로 줄어들 수 있게 한다.
        // 좁은 화면 대비 overflow-x-auto는 유지하되 1100px 부모에서는 스크롤이 생기지 않는다.
        <div className="mt-[4.4375rem] overflow-x-auto">
          <div className="w-full text-sm">
            <div className="grid grid-cols-[13.75rem_13.75rem_minmax(0,1fr)_9rem_7rem] gap-x-2 border-b border-line pb-[0.625rem] text-sm font-semibold text-ink-sub">
              <span>주문번호</span>
              <span>승인 일시</span>
              <span>상품</span>
              <span className="text-right">결제 금액</span>
              <span className="text-right">상태</span>
            </div>

            <div className="grid grid-cols-[13.75rem_13.75rem_minmax(0,1fr)_9rem_7rem] gap-x-2 gap-y-5 pt-[1.25rem]">
              {orders.map((order) => {
                const status = resolveStatus(order, refunds);
                return (
                  <Fragment key={order.id}>
                    {/* orders.id = 토스 orderId(sql/10_pricing_orders.sql) — 별도 order_number
                        컬럼이 없어 이 값 자체가 주문번호다. 실데이터는 시안(9자리 숫자)보다
                        훨씬 길어 표시는 formatOrderId로 축약하고 원본은 title에 남긴다. */}
                    <button
                      type="button"
                      onClick={() => setDetailOrder(order)}
                      title={order.id}
                      className="h-8 truncate self-center text-left text-accent underline underline-offset-2"
                    >
                      {formatOrderId(order.id)}
                    </button>
                    <span className="flex h-8 items-center truncate text-ink-sub">
                      {formatApprovedAt(order.paid_at)}
                    </span>
                    <span className="flex h-8 items-center truncate text-ink-strong">
                      {order.order_name}
                      {order.is_fake_entitlement && (
                        <span className="ml-1.5 shrink-0 text-xs text-ink-sub">(개발용)</span>
                      )}
                    </span>
                    <span className="flex h-8 items-center justify-end truncate text-ink-strong">
                      {formatKRW(order.amount)}
                    </span>
                    <span className="flex h-8 items-center justify-end">
                      <PaymentStatusBadge status={status} />
                    </span>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <PaymentDetailModal
        open={!!detailOrder}
        order={detailOrder}
        status={detailStatus}
        onClose={() => setDetailOrder(null)}
        onRequestRefund={handleRequestRefund}
        onViewReceipt={handleViewReceipt}
      />

      <ReceiptModal open={!!receiptOrder} order={receiptOrder} onClose={() => setReceiptOrder(null)} />

      <RefundRequestModal
        open={!!refundOrder}
        order={refundOrder}
        onClose={() => setRefundOrder(null)}
        onSubmitted={handleRefundSubmitted}
        // 서버가 "이미 신청 있음"으로 거부하면 목록만 다시 읽는다(접수 완료
        // 모달은 띄우지 않는다 — 접수된 게 아니다).
        onStaleData={onRefundSubmitted}
      />

      <RefundNoticeModal open={noticeOpen} onClose={() => setNoticeOpen(false)} />
    </section>
  );
}
