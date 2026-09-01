import { useCallback, useEffect, useState } from "react";
import PaymentDetailModal from "@/components/mypage/PaymentDetailModal";
import PaymentStatusBadge from "@/components/mypage/PaymentStatusBadge";
import PaymentTable from "@/components/mypage/PaymentTable";
import {
  formatApprovedAt,
  formatOrderId,
  formatProductNames,
  refundTargetNames,
  resolveOrderStatus,
} from "@/components/mypage/paymentRows";
import ReceiptModal from "@/components/mypage/ReceiptModal";
import RefundNoticeModal from "@/components/mypage/RefundNoticeModal";
import RefundRequestModal from "@/components/mypage/RefundRequestModal";
import { useAuth } from "@/context/AuthProvider";
import { formatKRW } from "@/data/pricingCatalog";
import type {
  CardInfo,
  EasyPayInfo,
  VirtualAccountInfo,
} from "@/hooks/usePaymentConfirmation";
import { supabase } from "@/lib/supabase";
import EnrollmentRequestModal from "./EnrollmentRequestModal";
import RefundApprovalModal from "./RefundApprovalModal";

// 학부모 "결제 내역" 탭 — 확정 디자인 3967:3944(내용 있음) / 3967:4412(빈 상태).
//
// "지난 결제내역" 제목 하나 아래 단일 표로 세 출처의 행을 합쳐 보여준다.
// 학부모가 "지금 내가 할 일"을 위에서부터 보게 하는 순서로 합친다 — 자녀가
// 올린 것(환불 요청 → 결제 요청)이 먼저고, 끝난 것이 뒤다. 각 행은 kind로
// 구분하고 클릭·상태 배지 렌더링을 kind에 따라 분기한다.
//
//   kind: "refund"   자녀가 보낸 환불 요청(approval_status='requested').
//                    행을 누르면 확인 모달이 열리고 거기서 금액을 본다
//                    (RefundApprovalModal — 학생 화면엔 금액이 없다).
//   kind: "pending"  자녀가 보낸 결제 요청(status='pending'). row 전체 클릭이
//                    유일한 트리거이고, approval_status 와 무관하게 항상
//                    승인/거절 확인 모달(EnrollmentRequestModal)을 먼저 연다 —
//                    거기서 "결제 진행하기"를 눌러야 /checkout 으로 간다.
//                    approved 인 건(수락까지 끝나고 결제창만 닫힌 경우)은 모달의
//                    거절 버튼이 "닫기"로 바뀔 뿐, 모달을 거치는 건 동일하다.
//   kind: "history"  결제가 끝난 주문(paid/waiting_deposit). 주문번호를 누르면
//                    기존 결제 상세 → 영수증/환불 신청 체인으로 이어진다.
//
// date 열은 승인 전(요청 시점)과 결제 완료(승인 시점) 행이 섞이므로 라벨을
// "일시"로 통일한다(값 자체는 kind별로 다른 시점을 그대로 보여준다).
//
// 자녀 이름은 fn_parent_children(sql/73)으로만 얻을 수 있다 — profiles_select_own
// 때문에 학부모가 자녀 프로필을 직접 못 읽는다.

const TABLE_HEADERS = {
  id: "주문번호",
  date: "일시",
  product: "상품",
  amount: "결제 금액",
  status: "상태",
};

type Order = {
  id: string;
  order_name?: string;
  amount: number;
  status?: string;
  approval_status?: string;
  reject_reason?: string | null;
  student_profile_id?: string;
  created_at?: string;
  paid_at?: string;
  method?: string;
  vat?: number | string | null;
  // 영수증(ReceiptModal) 전용 — useMyPageOrders.ts 와 동일 이유(그쪽 주석 참고).
  card?: CardInfo | null;
  virtual_account?: VirtualAccountInfo | null;
  easy_pay?: EasyPayInfo | null;
  approved_at?: string | null;
  is_fake_entitlement?: boolean;
  order_items?: {
    name: string;
    list_price?: number;
    price?: number;
    quantity?: number;
    // 번들 구성 내역 표기(태스크6, bundleComposition.ts) 용 — useMyPageOrders.ts
    // 와 동일 이유(그쪽 주석 참고).
    product_id?: string | null;
  }[];
  list_amount?: number;
  discount_amount?: number;
  coupon_redemptions?: {
    discount_amount: number;
    voided_at?: string | null;
    coupons?: { title?: string | null } | { title?: string | null }[] | null;
  }[];
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
  // v10 부분해지 — useMyPageOrders.ts 와 동일 이유(그쪽 주석 참고).
  quote?: unknown;
  order_item_ids?: number[] | null;
  terms_version?: string;
};

type ParentPaymentsTabProps = {
  orders?: Order[];
  refunds?: Refund[];
  // 상위(MyPage)가 가진 데이터(orders·refunds·탭 배지) 재조회 — 모달 액션 후
  // 아래 refreshAll 이 자체 pending 목록과 함께 호출한다.
  onRefresh?: () => void;
};

export default function ParentPaymentsTab({
  orders = [],
  refunds = [],
  onRefresh,
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

  // 세션은 AuthProvider(전역 단일 구독)에서 읽는다(명세 B-3 §4).
  const { userId: uid } = useAuth();

  // 결제 대기 주문은 상위(MyPage)가 내려주는 orders 에도 포함되어 있지만
  // (학생 화면이 필요로 함), 이 섹션은 여기서 직접 최신 상태로 다시 읽는다.
  // historyOrders(아래)는 이 pending 주문과 안 겹치도록 필터링한다.
  const reloadPending = useCallback(async () => {
    if (!uid) return;

    const [pend, children] = await Promise.all([
      supabase
        .from("orders")
        // list_amount/discount_amount/coupon_redemptions — EnrollmentRequestModal의
        // "원금"/"할인 금액"/"쿠폰" 행 분해용(useMyPageOrders.ts와 동일 이유).
        .select(
          "id, order_name, amount, status, approval_status, student_profile_id, created_at, order_items(name, list_price, price, quantity, product_id), list_amount, discount_amount, coupon_redemptions(discount_amount, voided_at, coupons(title))",
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
  }, [uid]);

  useEffect(() => {
    reloadPending();
  }, [reloadPending]);

  // 세 섹션(환불요청·결제 신청하기·지난 결제내역)은 데이터 출처가 갈린다 —
  // 1·3은 상위 orders/refunds, 2는 여기 pendingOrders. 어느 섹션의 액션이든
  // 다른 섹션의 상태(배지·목록·건수)를 바꿀 수 있으므로 항상 전부 다시 읽는다.
  const refreshAll = useCallback(() => {
    reloadPending();
    onRefresh?.();
  }, [reloadPending, onRefresh]);

  // 자녀가 보낸 환불 요청 — 학부모 본인 신청은 제약상 즉시 approved 라
  // 이 목록에 남지 않는다(refund_requests_parent_auto_approve_check).
  const refundRequests = refunds.filter(
    (r) => r.approval_status === "requested",
  );

  const historyOrders = orders.filter((o) => o.status !== "pending");

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

  const rows = [
    ...refundRequests.map((r) => ({
      key: `refund-${r.id}`,
      kind: "refund" as const,
      // idFull은 optional(exactOptionalPropertyTypes) — order_id 없으면 키 자체를
      // 생략한다. PaymentTable이 `idFull || idText`로 폴백하므로 동작은 동일하다.
      ...(r.order_id !== undefined && { idFull: r.order_id }),
      idText: formatOrderId(r.order_id),
      dateText: formatApprovedAt(r.created_at),
      // 부분해지 신청이면 대상 항목명만 나열한다 — order_name(전체 주문
      // 상품명)을 그대로 쓰면 환불 대상이 아닌 항목까지 포함된 것처럼
      // 보인다.
      productText: refundTargetNames(r) || r.order_name || "",
      amountText: formatKRW(r.gross_amount || r.amount),
      raw: r,
    })),
    ...pendingOrders.map((o) => {
      // student_profile_id가 없으면 nameById 조회를 건너뛴다(PaymentTableRow는
      // productText가 필수라 undefined 대신 order_name/빈 문자열로 폴백한다).
      const childName = o.student_profile_id
        ? nameById[o.student_profile_id]
        : undefined;
      return {
        key: `pending-${o.id}`,
        kind: "pending" as const,
        idFull: o.id,
        idText: formatOrderId(o.id),
        dateText: formatApprovedAt(o.created_at),
        productText: childName
          ? `${childName} · ${formatProductNames(o)}`
          : formatProductNames(o),
        amountText: formatKRW(o.amount),
        raw: o,
      };
    }),
    ...historyOrders.map((o) => ({
      key: `order-${o.id}`,
      kind: "history" as const,
      idFull: o.id,
      idText: formatOrderId(o.id),
      dateText: formatApprovedAt(o.paid_at),
      productText: formatProductNames(o),
      amountText: formatKRW(o.amount),
      ...(o.is_fake_entitlement && { note: "(개발용)" }),
      raw: o,
    })),
  ];

  return (
    <div className="flex flex-col gap-18">
      <section>
        <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
          지난 결제내역
        </h2>
        <PaymentTable
          headers={TABLE_HEADERS}
          emptyText="결제 내역이 없습니다."
          rows={rows}
          onSelect={(row) => {
            if (row.kind === "refund") setApprovalRequest(row.raw as Refund);
            else if (row.kind === "pending")
              setEnrollmentRequest(row.raw as Order);
            else setDetailOrder(row.raw as Order);
          }}
          renderStatus={(row) => {
            if (row.kind === "refund")
              return <PaymentStatusBadge status="refund_approval_pending" />;
            if (row.kind === "pending")
              return (
                <PaymentStatusBadge
                  status={
                    (row.raw as Order).approval_status === "approved"
                      ? "enrollment_approved"
                      : "enrollment_requested"
                  }
                />
              );
            return (
              <PaymentStatusBadge
                status={resolveOrderStatus(row.raw as Order, refunds)}
              />
            );
          }}
        />
      </section>

      <PaymentDetailModal
        open={!!detailOrder}
        order={detailOrder}
        // status는 optional(exactOptionalPropertyTypes) — detailOrder가 없으면
        // 컴포넌트가 `!order`로 조기 리턴하므로 status는 어차피 안 쓰인다. 키 생략으로
        // 대체(동작 동일).
        {...(detailOrder && {
          status: resolveOrderStatus(detailOrder, refunds),
        })}
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
          refreshAll();
        }}
        onStaleData={refreshAll}
      />

      <RefundNoticeModal
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
      />

      <EnrollmentRequestModal
        open={!!enrollmentRequest}
        order={enrollmentRequest}
        childName={
          enrollmentRequest?.student_profile_id
            ? nameById[enrollmentRequest.student_profile_id] || ""
            : ""
        }
        onClose={() => setEnrollmentRequest(null)}
        onRejected={() => {
          setEnrollmentRequest(null);
          refreshAll();
        }}
      />

      <RefundApprovalModal
        open={!!approvalRequest}
        request={approvalRequest}
        // 환불 신청(refund_requests)에는 결제수단 정보가 없다 — 그 주문
        // (orders)에서 가상계좌 여부·환불계좌 프리필값을 찾아 내려준다.
        virtualAccount={
          approvalRequest
            ? (orders.find((o) => o.id === approvalRequest.order_id)
                ?.virtual_account ?? null)
            : null
        }
        childName={
          approvalRequest?.student_profile_id
            ? nameById[approvalRequest.student_profile_id] || ""
            : ""
        }
        onClose={() => setApprovalRequest(null)}
        onResponded={() => {
          setApprovalRequest(null);
          refreshAll();
        }}
      />
    </div>
  );
}
