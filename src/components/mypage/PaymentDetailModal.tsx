import { useId } from "react";
import { formatKRW } from "@/data/pricingCatalog";
import MyPageModalShell from "./MyPageModalShell";

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
  discount_amount?: number;
  coupon_redemptions?: { discount_amount: number; voided_at?: string | null }[];
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
  const titleId = useId();

  if (!open || !order) return null;

  // 부가세는 토스 승인 응답 원본(orders.raw.vat)이 정본이다 — 우리가 금액에서
  // 역산하지 않는다(면세/과세 판정과 반올림 규칙을 우리가 알 수 없다).
  // MyPage.jsx 가 `vat:raw->>vat` 로 뽑아 내려준다. 값이 없으면 대시로 둔다.
  const vat =
    order.vat === null || order.vat === undefined || order.vat === ""
      ? null
      : Number(order.vat);

  // 쿠폰 할인 정본은 coupon_redemptions(voided_at is null 행의 합) — sql/87 정책
  // 적용 전이면 학생 소유/auto 쿠폰의 redemption이 일부/0행으로 와 쿠폰 행이 덜
  // 보이는 것으로 자연 폴백한다. 상품 할인은 discount_amount(상품+쿠폰 합,
  // sql/55 불변식)에서 쿠폰 합을 뺀 나머지다(EnrollmentRequestModal과 동일 계산).
  const couponSum = (order.coupon_redemptions ?? [])
    .filter((r) => !r.voided_at)
    .reduce((sum, r) => sum + r.discount_amount, 0);
  const productDiscount = Math.max(0, (order.discount_amount ?? 0) - couponSum);

  const rows = [
    { label: "주문번호", value: order.id },
    { label: "결제 수단", value: order.method || "-" },
    { label: "결제 상품", value: order.order_name || "-" },
    ...(productDiscount > 0
      ? [{ label: "할인 금액", value: `-${formatKRW(productDiscount)}` }]
      : []),
    ...(couponSum > 0
      ? [{ label: "쿠폰", value: `-${formatKRW(couponSum)}` }]
      : []),
    { label: "승인 일시", value: formatApprovedAtDetail(order.paid_at) },
    { label: "부가 가치", value: Number.isFinite(vat) ? formatKRW(vat) : "-" },
    { label: "결제 금액", value: formatKRW(order.amount) },
    { label: "결제 상태", value: STATUS_TEXT[status || ""] || "-" },
  ];

  // 환불 신청 버튼은 결제가 확정된 건에만 노출한다. 입금 대기(가상계좌 미입금)는
  // 아직 들어온 돈이 없고, 이미 환불이 걸린 건은 중복 신청이 서버에서 거부된다
  // (WC007) — 누를 수 있게 두면 실패만 보게 된다.
  //
  // 학부모 반려 건은 예외로 다시 열어준다. 반려는 종결이 아니라 "이번엔 안
  // 된다"이고, 같은 주문으로 재신청하는 것이 설계 확정 사항이다(sql/68 —
  // 미종결 판정에서 approval_status='rejected' 를 빼둔 이유가 이것이다).
  //
  // 학생·학부모 둘 다 신청할 수 있다. 학생이 신청하면 학부모 확인 단계를
  // 거친다(확정 디자인 3967:3561 "환불을 요청할게요" — "결제는 OOO
  // 학부모님이 하셨어요. 환불 요청을 보내면 학부모님이 확인 후 환불을
  // 진행합니다"). 2026-08-13 잠시 결제자 전용으로 좁혔다가 그 디자인을
  // 확인하고 되돌렸다(sql/75).
  const canRequestRefund =
    status === "paid" || status === "refund_parent_rejected";

  // 영수증은 결제가 실제로 이뤄진 건에만 있다 — superseded(대체됨) 주문은
  // 결제된 적이 없어 영수증을 보여주면 안 된다.
  const canViewReceipt = status !== "superseded";

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="w-135"
    >
      <div className="flex-1 overflow-y-auto px-8.75 pt-10">
        <h2
          id={titleId}
          className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-strong"
        >
          결제 상세 내역
        </h2>

        <dl className="mt-7.5 flex flex-col pb-7.5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 border-b border-line/60 py-3.75"
            >
              <dt className="shrink-0 text-[0.875rem] text-ink-sub">
                {row.label}
              </dt>
              <dd
                className="truncate text-right text-[0.875rem] text-ink-strong"
                title={row.value}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex justify-center gap-3 border-t border-[#F0F0F0] px-8.75 py-6.25">
        <button
          type="button"
          onClick={onClose}
          className="h-10 w-33 rounded-lg border border-[#E3E3E3] text-[0.875rem] font-medium text-ink-sub transition-colors hover:bg-surface-04"
        >
          닫기
        </button>
        {canRequestRefund && (
          <button
            type="button"
            onClick={onRequestRefund}
            className="h-10 w-33 rounded-lg border border-[#E3E3E3] text-[0.875rem] font-medium text-error transition-colors hover:bg-surface-04"
          >
            환불 신청
          </button>
        )}
        {canViewReceipt && (
          <button
            type="button"
            onClick={onViewReceipt}
            className="h-10 w-33 rounded-lg bg-primary text-[0.875rem] font-semibold text-white transition-colors hover:opacity-90"
          >
            영수증 보기
          </button>
        )}
      </div>
    </MyPageModalShell>
  );
}
