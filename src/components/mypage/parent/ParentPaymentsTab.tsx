import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatKRW } from "../../../data/pricingCatalog";
import { supabase } from "../../../lib/supabase";
import PaymentDetailModal from "../PaymentDetailModal";
import PaymentStatusBadge from "../PaymentStatusBadge";
import PaymentTable from "../PaymentTable";
import {
  formatApprovedAt,
  formatOrderId,
  resolveOrderStatus,
} from "../paymentRows";
import ReceiptModal from "../ReceiptModal";
import RefundNoticeModal from "../RefundNoticeModal";
import RefundRequestModal from "../RefundRequestModal";
import EnrollmentRequestModal from "./EnrollmentRequestModal";
import RefundApprovalModal from "./RefundApprovalModal";

// 학부모 "결제 내역" 탭 — 확정 디자인 3967:3944(내용 있음) / 3967:4412(빈 상태).
//
// 세 섹션이 같은 5열 표를 쓴다. 학부모가 "지금 내가 할 일"을 위에서부터 보게
// 하는 순서다 — 자녀가 올린 것(환불 요청 → 결제 요청)이 먼저고, 끝난 것이 뒤다.
//
//   1) 환불요청      자녀가 보낸 환불 요청(approval_status='requested').
//                    행을 누르면 확인 모달이 열리고 거기서 금액을 본다
//                    (RefundApprovalModal — 학생 화면엔 금액이 없다).
//   2) 결제 신청하기  자녀가 보낸 결제 요청(status='pending'). 상태 칩이 곧
//                    액션이라 /checkout 으로 보낸다. approval_status 가
//                    approved 인 건은 수락까지 끝나고 결제창만 닫힌 경우로,
//                    ParentCheckout 이 재개 모드로 받는다.
//   3) 지난 결제내역  결제가 끝난 주문(paid/waiting_deposit). 주문번호를 누르면
//                    기존 결제 상세 → 영수증/환불 신청 체인으로 이어진다.
//
// 자녀 이름은 fn_parent_children(sql/73)으로만 얻을 수 있다 — profiles_select_own
// 때문에 학부모가 자녀 프로필을 직접 못 읽는다.

const TABLE_HEADERS = {
  id: "주문번호",
  date: "승인 일시",
  product: "상품",
  amount: "결제 금액",
  status: "상태",
};

const EMPTY_TEXT = "요청 사항이 없습니다.";

type Order = {
  id: string;
  order_name?: string;
  amount: number;
  status?: string;
  approval_status?: string;
  student_profile_id?: string;
  created_at?: string;
  paid_at?: string;
  method?: string;
  vat?: number | string | null;
  is_fake_entitlement?: boolean;
};

type Refund = {
  id: string;
  order_id?: string;
  order_name?: string;
  amount: number;
  gross_amount?: number | null;
  reason?: string;
  status?: string;
  approval_status?: string;
  student_profile_id?: string;
  created_at?: string;
};

type ParentPaymentsTabProps = {
  orders?: Order[];
  refunds?: Refund[];
  onRefundSubmitted?: () => void;
};

export default function ParentPaymentsTab({
  orders = [],
  refunds = [],
  onRefundSubmitted,
}: ParentPaymentsTabProps) {
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState<Refund | null>(null);
  const [enrollmentRequest, setEnrollmentRequest] = useState<Order | null>(
    null,
  );

  // 결제 대기 주문은 상위(MyPage)가 내려주는 orders 에 없다 — 그쪽은
  // paid/waiting_deposit 만 읽는다. 이 탭에서만 필요하므로 여기서 직접 읽는다.
  const reloadPending = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return;

    const [pend, children] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_name, amount, status, approval_status, student_profile_id, created_at",
        )
        .eq("parent_profile_id", uid)
        .eq("status", "pending")
        .in("approval_status", ["requested", "approved"])
        .order("created_at", { ascending: false }),
      supabase.rpc("fn_parent_children"),
    ]);

    if (!pend.error) setPendingOrders(pend.data || []);
    if (!children.error && Array.isArray(children.data)) {
      const map: Record<string, string> = {};
      for (const child of children.data)
        map[child.student_profile_id] = child.student_name;
      setNameById(map);
    }
  }, []);

  useEffect(() => {
    reloadPending();
  }, [reloadPending]);

  // 자녀가 보낸 환불 요청 — 학부모 본인 신청은 제약상 즉시 approved 라
  // 이 목록에 남지 않는다(refund_requests_parent_auto_approve_check).
  const refundRequests = refunds.filter(
    (r) => r.approval_status === "requested",
  );

  const historyOrders = orders;

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

  return (
    <div className="flex flex-col gap-[4.5rem]">
      {/* 1) 환불요청 */}
      <section>
        <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
          자녀의 환불요청
        </h2>
        <PaymentTable
          headers={TABLE_HEADERS}
          emptyText={EMPTY_TEXT}
          rows={refundRequests.map((r) => ({
            key: `refund-${r.id}`,
            idFull: r.order_id,
            idText: formatOrderId(r.order_id),
            dateText: formatApprovedAt(r.created_at),
            productText: r.order_name,
            amountText: formatKRW(r.gross_amount || r.amount),
            raw: r,
          }))}
          onSelect={(row) => setApprovalRequest(row.raw as Refund)}
          renderStatus={(row) => (
            <button
              type="button"
              onClick={() => setApprovalRequest(row.raw as Refund)}
              className="transition hover:brightness-95"
            >
              <PaymentStatusBadge status="refund_approval_pending" />
            </button>
          )}
        />
      </section>

      {/* 2) 결제 신청하기 */}
      <section>
        <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
          결제 신청하기
        </h2>
        <PaymentTable
          headers={TABLE_HEADERS}
          emptyText={EMPTY_TEXT}
          rows={pendingOrders.map((o) => ({
            key: `pending-${o.id}`,
            idFull: o.id,
            idText: formatOrderId(o.id),
            dateText: formatApprovedAt(o.created_at),
            productText: nameById[o.student_profile_id]
              ? `${nameById[o.student_profile_id]} · ${o.order_name}`
              : o.order_name,
            amountText: formatKRW(o.amount),
            raw: o,
          }))}
          // 상태 칩은 시안대로 결제 진입 링크다. 거절 경로는 시안에 없어
          // 주문번호 클릭 → 확인 모달로 열어 뒀다(EnrollmentRequestModal).
          onSelect={(row) => setEnrollmentRequest(row.raw as Order)}
          renderStatus={(row) => (
            <Link
              to={`/checkout?order=${encodeURIComponent((row.raw as Order).id)}`}
              className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-[#f5ebcb] px-3 text-sm font-medium text-gold transition hover:brightness-95"
            >
              결제 진행하기
            </Link>
          )}
        />
      </section>

      {/* 3) 지난 결제내역 */}
      <section>
        <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
          지난 결제내역
        </h2>
        <PaymentTable
          headers={TABLE_HEADERS}
          emptyText="결제 내역이 없습니다."
          rows={historyOrders.map((o) => ({
            key: `order-${o.id}`,
            idFull: o.id,
            idText: formatOrderId(o.id),
            dateText: formatApprovedAt(o.paid_at),
            productText: o.order_name,
            amountText: formatKRW(o.amount),
            note: o.is_fake_entitlement ? "(개발용)" : null,
            raw: o,
          }))}
          onSelect={(row) => setDetailOrder(row.raw as Order)}
          renderStatus={(row) => (
            <PaymentStatusBadge
              status={resolveOrderStatus(row.raw as Order, refunds)}
            />
          )}
        />
      </section>

      <PaymentDetailModal
        open={!!detailOrder}
        order={detailOrder}
        status={detailOrder ? resolveOrderStatus(detailOrder, refunds) : null}
        onClose={() => setDetailOrder(null)}
        onRequestRefund={handleRequestRefund}
        onViewReceipt={handleViewReceipt}
      />

      <ReceiptModal
        open={!!receiptOrder}
        order={receiptOrder}
        onClose={() => setReceiptOrder(null)}
      />

      <RefundRequestModal
        open={!!refundOrder}
        order={refundOrder}
        onClose={() => setRefundOrder(null)}
        onSubmitted={() => {
          setRefundOrder(null);
          setNoticeOpen(true);
          onRefundSubmitted?.();
        }}
        onStaleData={onRefundSubmitted}
      />

      <RefundNoticeModal
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
      />

      <EnrollmentRequestModal
        open={!!enrollmentRequest}
        order={enrollmentRequest}
        childName={
          enrollmentRequest
            ? nameById[enrollmentRequest.student_profile_id]
            : ""
        }
        onClose={() => setEnrollmentRequest(null)}
        onRejected={() => {
          setEnrollmentRequest(null);
          reloadPending();
        }}
      />

      <RefundApprovalModal
        open={!!approvalRequest}
        request={approvalRequest}
        childName={
          approvalRequest ? nameById[approvalRequest.student_profile_id] : ""
        }
        onClose={() => setApprovalRequest(null)}
        onResponded={() => {
          setApprovalRequest(null);
          onRefundSubmitted?.();
        }}
      />
    </div>
  );
}
