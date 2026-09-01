import MyPageModalShell from "./MyPageModalShell";
import InfoRowList from "./modal/InfoRowList";
import ModalFooter from "./modal/ModalFooter";

// 학생 "신청 상세 내역" 모달 (Figma 3967:3571, 583×376).
//
// 학부모의 결제 상세 모달(PaymentDetailModal)과 **다른 화면**이다. 학생은
// 금액을 보지 않는다(2026-08-13 확정) — 결제 금액·부가세·영수증이 전부 없고,
// 대신 "누가 신청했고 누가 결제했는가"를 보여준다.
//
// 시안 행 4개: 신청일 / 신청자 / 결제담당 / 결제완료일.
// 버튼 2개: 닫기 / 환불 신청.
//
// 결제담당(학부모 이름)은 학생이 직접 읽을 수 없다 — profiles_select_own 은
// 자기 행만 열어 준다. 상위(PaymentsTab)가 parent_child_links 로 얻은 이름을
// parentName 으로 내려준다. 이름을 모르면 일반 라벨로 떨어뜨린다(지어내지 않는다).

function formatStamp(value: string | number | Date | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}. ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type RequestOrder = {
  created_at?: string;
  paid_at?: string;
  approval_status?: string;
  reject_reason?: string | null;
};

type StudentRequestDetailModalProps = {
  open: boolean;
  order: RequestOrder | null;
  studentName?: string;
  parentName?: string;
  canRequestRefund?: boolean;
  onClose: () => void;
  onRequestRefund?: () => void;
};

export default function StudentRequestDetailModal({
  open,
  order,
  studentName,
  parentName,
  canRequestRefund = false,
  onClose,
  onRequestRefund,
}: StudentRequestDetailModalProps) {
  if (!open || !order) return null;

  const isSuperseded = order.approval_status === "superseded";
  // 대체된 주문은 결제가 이뤄지지 않았다 — 환불 대상이 아니므로 상위에서
  // true 가 내려오더라도 여기서 한 번 더 막는다.
  const showRefundButton = canRequestRefund && !isSuperseded;

  const rows = [
    { label: "신청일", value: formatStamp(order.created_at) },
    {
      label: "신청자",
      value: studentName ? `${studentName}(학생)` : "학생 본인",
    },
    {
      label: "결제담당",
      value: parentName ? `${parentName} 학부모님` : "학부모님",
    },
    // 결제 전이면 아직 없다 — 대시로 둔다(0원·미정 같은 값을 만들지 않는다).
    {
      label: "결제완료일",
      value: order.paid_at ? formatStamp(order.paid_at) : "-",
    },
    // 반려 건에만(orders_reject_reason_pairing_check — approval_status='rejected'일
    // 때만 값이 있다) 노출한다. 폴백 문구 없이 값이 없으면 행 자체를 렌더하지 않는다.
    ...(order.approval_status === "rejected" && order.reject_reason
      ? [{ label: "학부모 반려 사유", value: order.reject_reason }]
      : []),
  ];

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="md"
      title="신청 상세 내역"
      footer={
        <ModalFooter
          buttons={[
            {
              key: "close",
              label: "닫기",
              variant: "neutral",
              onClick: onClose,
            },
            ...(showRefundButton
              ? [
                  {
                    key: "refund",
                    label: "환불 신청",
                    variant: "primary" as const,
                    onClick: onRequestRefund,
                  },
                ]
              : []),
          ]}
        />
      }
    >
      <div className="flex-1 overflow-y-auto px-8.75">
        {isSuperseded && (
          <p className="mt-5 rounded-lg bg-surface-04 px-4 py-3 text-center text-[0.875rem] text-ink-sub">
            학부모님이 다른 상품으로 결제하셨어요.
          </p>
        )}

        <dl className="mt-7.5 flex flex-col pb-7.5">
          <InfoRowList rows={rows} />
        </dl>
      </div>
    </MyPageModalShell>
  );
}
