import OrderAmountBreakdown from "@/components/mypage/OrderAmountBreakdown";
import MyPageModalShell from "./MyPageModalShell";
import InfoRowList from "./modal/InfoRowList";
import ModalFooter from "./modal/ModalFooter";

// 결제 상세 내역 모달 (Figma 3665:6278).
//
// 시안 플로우: 표의 주문번호 클릭 → **결제 상세 내역** → [영수증 보기]를 눌러야
// 결제 영수증(3665:6975, ReceiptModal)으로 넘어간다. 이 중간 단계가 통째로
// 빠져 있어서 지금까지는 주문번호를 누르면 영수증이 바로 떴다 — 그 결과 시안이
// 여기 둔 [환불 신청] 진입점도 함께 없었다(환불은 표 아래 접히는 폼이었다).
//
// 승인 일시는 표(YYYY/MM/DD)와 달리 시안이 분 단위까지 보여준다
// ("2026. 07. 28. 14:22").

// 결제 상태 행 — 표의 배지와 같은 판정(PaymentsTab resolveStatus)을 문자열로만 쓴다.
const STATUS_TEXT: Record<string, string> = {
  paid: "결제 완료",
  pending: "입금 대기",
  refund_approval_pending: "환불 요청 대기",
  refund_parent_rejected: "학부모 반려",
  refund_requested: "환불 진행 중",
  refund_processing: "환불 진행 중",
  refund_completed: "환불 완료",
  refund_rejected: "환불 반려",
  superseded: "다른 상품으로 결제됨",
  enrollment_parent_rejected: "학부모 반려",
};

function formatApprovedAtDetail(
  value: string | number | Date | null | undefined,
) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}. ${m}. ${day}. ${hh}:${mm}`;
}

type PaymentOrder = {
  id: string;
  method?: string;
  order_name?: string;
  paid_at?: string;
  vat?: number | string | null;
  amount: number;
  reject_reason?: string | null;
  order_items?: {
    name: string;
    list_price?: number;
    price?: number;
    quantity?: number;
  }[];
  list_amount?: number;
  discount_amount?: number;
  coupon_redemptions?: {
    discount_amount: number;
    voided_at?: string | null;
    coupons?: { title?: string | null } | { title?: string | null }[] | null;
  }[];
};

type PaymentDetailModalProps = {
  open: boolean;
  order: PaymentOrder | null;
  status?: string;
  onClose: () => void;
  onRequestRefund?: () => void;
  onViewReceipt?: () => void;
};

export default function PaymentDetailModal({
  open,
  order,
  status,
  onClose,
  onRequestRefund,
  onViewReceipt,
}: PaymentDetailModalProps) {
  if (!open || !order) return null;

  // 주문 메타(주문번호/결제 수단/승인 일시/결제 상태)를 위에 몰고, 금액 분해
  // (OrderAmountBreakdown — 항목/할인/합계 영수증형 섹션)는 맨 아래에 둔다
  // (사용자 확정). 금액 분해는 EnrollmentRequestModal과 공유해 두 화면이 같은
  // 주문을 다르게 보여주지 않게 한다.
  const metaRows = [
    { label: "주문번호", value: order.id },
    { label: "결제 수단", value: order.method || "-" },
    { label: "승인 일시", value: formatApprovedAtDetail(order.paid_at) },
    { label: "결제 상태", value: STATUS_TEXT[status || ""] || "-" },
    // 반려 건에만(orders_reject_reason_pairing_check) 노출한다. 폴백 문구 없이
    // 값이 없으면 행 자체를 렌더하지 않는다.
    ...(status === "enrollment_parent_rejected" && order.reject_reason
      ? [{ label: "학부모 반려 사유", value: order.reject_reason }]
      : []),
  ];

  // 환불 신청 버튼은 결제가 확정된 건에만 노출한다. 입금 대기(가상계좌 미입금)는
  // 아직 들어온 돈이 없고, 이미 환불이 걸린 건은 중복 신청이 서버에서 거부된다
  // (WC007) — 누를 수 있게 두면 실패만 보게 된다.
  //
  // 학부모 반려(refund_parent_rejected) 건은 종결이다 — 재신청 버튼을 열지
  // 않는다(사용자 확정 2026-08-19, sql/88 WC057 이 서버에서도 거부).
  // "반려 후 재신청 허용"이던 이전 결정(sql/68·75)을 뒤집은 것.
  //
  // 학생·학부모 둘 다 신청할 수 있다. 학생이 신청하면 학부모 확인 단계를
  // 거친다(확정 디자인 3967:3561 "환불을 요청할게요").
  //
  // 일부 환불(refund_partial, v10 부분해지 완료)은 종결이 아니다 — 열린 신청이
  // 없고 잔여 구성서비스가 살아 있는 상태라, 남은 항목의 재신청 경로를 열어
  // 둔다(서버도 회수된 라인만 WC060 으로 거르고 잔여 신청은 받는다).
  const canRequestRefund = status === "paid" || status === "refund_partial";

  // 영수증은 결제가 실제로 이뤄진 건에만 있다 — superseded(대체됨)·
  // enrollment_parent_rejected(반려) 주문은 결제된 적이 없어 영수증을
  // 보여주면 안 된다.
  const canViewReceipt =
    status !== "superseded" && status !== "enrollment_parent_rejected";

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="md"
      title="결제 상세 내역"
      footer={
        <ModalFooter
          buttons={[
            {
              key: "close",
              label: "닫기",
              variant: "neutral",
              onClick: onClose,
            },
            ...(canRequestRefund
              ? [
                  {
                    key: "refund",
                    label: "환불 신청",
                    variant: "destructive-outline" as const,
                    onClick: onRequestRefund,
                  },
                ]
              : []),
            ...(canViewReceipt
              ? [
                  {
                    key: "receipt",
                    label: "영수증 보기",
                    variant: "primary" as const,
                    onClick: onViewReceipt,
                  },
                ]
              : []),
          ]}
        />
      }
    >
      <div className="flex-1 overflow-y-auto px-8.75">
        <dl className="mt-7.5 flex flex-col pb-7.5">
          <InfoRowList rows={metaRows} />
          <div className="py-3.75">
            <OrderAmountBreakdown
              order={order}
              amount={order.amount}
              fallbackName={order.order_name}
            />
          </div>
        </dl>
      </div>
    </MyPageModalShell>
  );
}
