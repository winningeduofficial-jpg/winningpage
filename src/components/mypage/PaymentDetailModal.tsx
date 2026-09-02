import { useBundleCompositionMap } from "@/components/mypage/bundleComposition";
import OrderAmountBreakdown from "@/components/mypage/OrderAmountBreakdown";
import MyPageModalShell from "./MyPageModalShell";
import InfoRowList from "./modal/InfoRowList";
import ModalFooter from "./modal/ModalFooter";

// 결제/신청 상세 내역 모달 (Figma 3665:6278 학부모 / 3967:3571 학생).
//
// 시안 플로우: 표의 주문번호 클릭 → **결제 상세 내역** → [영수증 보기]를 눌러야
// 결제 영수증(3665:6975, ReceiptModal)으로 넘어간다. 이 중간 단계가 통째로
// 빠져 있어서 지금까지는 주문번호를 누르면 영수증이 바로 떴다 — 그 결과 시안이
// 여기 둔 [환불 신청] 진입점도 함께 없었다(환불은 표 아래 접히는 폼이었다).
//
// 승인 일시는 표(YYYY/MM/DD)와 달리 시안이 분 단위까지 보여준다
// ("2026. 07. 28. 14:22").
//
// ── asStudent(2026-09-01, 학생 신청 내역 B안 통일) ──
// 예전엔 학생 전용 StudentRequestDetailModal이 따로 있었다(신청일/신청자/
// 결제담당/결제완료일 4행, 금액 없음). 사용자 확정으로 "형식만 통일, 금액
// 정책은 유지" — 껍데기(MyPageModalShell)·정보행 마크업(InfoRowList)·상태
// 어휘(PaymentStatusBadge, STATUS_TEXT)는 학부모와 완전히 같은 것을 쓰고,
// 금액 관련 행·금액 분해(OrderAmountBreakdown)·영수증 버튼만 asStudent일 때
// 뺀다. 신청자/결제담당 행(학생 화면 고유 가치)은 그대로 유지한다. 번들 구성
// 부속 라인(bundleComposition)은 금액이 없는 정보라 asStudent에서도 그대로
// 보여준다(RefundRequestModal의 같은 패턴 재사용) — 다만 OrderAmountBreakdown
// 자체가 빠지므로 별도 섹션으로 그린다.
const STATUS_TEXT: Record<string, string> = {
  paid: "결제 완료",
  pending: "입금 대기",
  refund_approval_pending: "환불 요청 대기",
  refund_parent_rejected: "학부모 반려",
  refund_requested: "환불 진행 중",
  refund_processing: "환불 진행 중",
  refund_completed: "환불 완료",
  refund_partial: "일부 환불",
  refund_rejected: "환불 반려",
  superseded: "다른 상품으로 결제됨",
  enrollment_parent_rejected: "학부모 반려",
  // 학생의 "학부모 결제대기" 상태(order.status='pending') — 학부모 쪽
  // ParentPaymentsTab의 pending 행과 같은 배지 키(PaymentStatusBadge)를 그대로
  // 재사용한다(신규 어휘를 만들지 않는다).
  enrollment_requested: "승인 필요",
  enrollment_approved: "결제 대기",
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
  order_name?: string | null;
  created_at?: string;
  paid_at?: string;
  vat?: number | string | null;
  amount: number;
  reject_reason?: string | null;
  order_items?: {
    name: string;
    list_price?: number;
    price?: number;
    quantity?: number;
    // 번들 구성 내역 표기(태스크6, bundleComposition.ts) — OrderAmountBreakdown
    // (학부모)과 아래 학생 전용 "신청 상품" 섹션이 함께 쓴다.
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

type PaymentDetailModalProps = {
  open: boolean;
  order: PaymentOrder | null;
  status?: string;
  // 학생 화면 — 금액을 숨기고 신청자/결제담당 행을 보여준다(2026-08-13 확정,
  // 2026-09-01 형식 통일). 학부모 이름은 학생 RLS로 못 읽어(profiles_select_own)
  // 상위가 fn_student_parent로 받아 내려준다 — 값이 없으면 지어내지 않고
  // 일반 라벨로 떨어뜨린다.
  asStudent?: boolean;
  studentName?: string;
  parentName?: string;
  onClose: () => void;
  onRequestRefund?: () => void;
  onViewReceipt?: () => void;
};

export default function PaymentDetailModal({
  open,
  order,
  status,
  asStudent = false,
  studentName,
  parentName,
  onClose,
  onRequestRefund,
  onViewReceipt,
}: PaymentDetailModalProps) {
  // 번들 구성 내역 훅은 order가 null이어도(모달 닫힘) 항상 같은 순서로
  // 불러야 한다(React hooks 규칙) — 아래 조기 반환보다 먼저 온다.
  const productIds = (order?.order_items ?? []).map((item) => item.product_id);
  const bundleMap = useBundleCompositionMap(productIds);

  if (!open || !order) return null;

  const isSuperseded = status === "superseded";

  // 주문 메타를 위에 몰고, 금액 분해(OrderAmountBreakdown — 항목/할인/합계
  // 영수증형 섹션)는 맨 아래에 둔다(사용자 확정). 금액 분해는
  // EnrollmentRequestModal과 공유해 두 화면이 같은 주문을 다르게 보여주지
  // 않게 한다. 학생(asStudent)은 이 섹션 자체를 렌더하지 않는다.
  const metaRows = asStudent
    ? [
        { label: "신청일", value: formatApprovedAtDetail(order.created_at) },
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
          value: order.paid_at ? formatApprovedAtDetail(order.paid_at) : "-",
        },
        { label: "상태", value: STATUS_TEXT[status || ""] || "-" },
        ...(status === "enrollment_parent_rejected" && order.reject_reason
          ? [{ label: "학부모 반려 사유", value: order.reject_reason }]
          : []),
      ]
    : [
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
  // 거친다(확정 디자인 3967:3561 "환불을 요청할게요") — RefundRequestModal이
  // asStudent 여부로 그 분기를 이미 담당하므로 여기서는 판정만 공유한다.
  //
  // 일부 환불(refund_partial, v10 부분해지 완료)은 종결이 아니다 — 열린 신청이
  // 없고 잔여 구성서비스가 살아 있는 상태라, 남은 항목의 재신청 경로를 열어
  // 둔다(서버도 회수된 라인만 WC060 으로 거르고 잔여 신청은 받는다).
  const canRequestRefund =
    (status === "paid" || status === "refund_partial") && !isSuperseded;

  // 영수증은 결제가 실제로 이뤄진 건에만 있다 — superseded(대체됨)·
  // enrollment_parent_rejected(반려) 주문은 결제된 적이 없어 영수증을
  // 보여주면 안 된다. 학생에게는 영수증 자체를 아예 보여주지 않는다(결제
  // 수단·부가세 등 금액 부속 정보라 asStudent 금액 비표시 정책과 같은 축).
  const canViewReceipt =
    !asStudent &&
    status !== "superseded" &&
    status !== "enrollment_parent_rejected";

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="md"
      title={asStudent ? "신청 상세 내역" : "결제 상세 내역"}
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
                    variant: (asStudent ? "primary" : "destructive-outline") as
                      | "primary"
                      | "destructive-outline",
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
        {isSuperseded && asStudent && (
          <p className="mt-5 rounded-lg bg-surface-04 px-4 py-3 text-center text-[0.875rem] text-ink-sub">
            학부모님이 다른 상품으로 결제하셨어요.
          </p>
        )}

        <dl className="mt-7.5 flex flex-col pb-7.5">
          <InfoRowList rows={metaRows} />

          {asStudent ? (
            // 학생 전용 "신청 상품" — 번들 구성 부속 라인은 금액이 없는
            // 정보라 그대로 보여준다(정책 위반 아님). 금액 분해
            // (OrderAmountBreakdown)는 렌더하지 않는다.
            <div className="py-3.75">
              <p className="text-[0.8125rem] font-semibold text-ink-sub">
                신청 상품
              </p>
              {(order.order_items && order.order_items.length > 0
                ? order.order_items
                : [{ name: order.order_name || "-", product_id: null }]
              ).map((item, i) => {
                const note = bundleMap.get(item.product_id || "") ?? [];
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: 파생 표시 행이라 고유 id가 없고 재정렬·삽입 없이 통째로 다시 그린다(OrderAmountBreakdown의 같은 패턴).
                    key={`item-${item.name}-${i}`}
                    className={i > 0 ? "mt-3" : "mt-2"}
                  >
                    <p className="text-[0.9375rem] text-ink">{item.name}</p>
                    {note.length > 0 && (
                      <div className="mt-1 flex flex-col gap-0.5 pl-3">
                        {note.map((line) => (
                          <p
                            key={line}
                            className="text-[0.8125rem] text-ink-sub"
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-3.75">
              <OrderAmountBreakdown
                order={order}
                amount={order.amount}
                fallbackName={order.order_name ?? undefined}
              />
            </div>
          )}
        </dl>
      </div>
    </MyPageModalShell>
  );
}
