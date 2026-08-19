import { useCallback, useId, useState } from "react";
import { useNavigate } from "react-router";
import MyPageModalShell from "@/components/mypage/MyPageModalShell";
import { computeDiscountBreakdown } from "@/components/mypage/paymentRows";
import { formatKRW } from "@/data/pricingCatalog";
import { supabase } from "@/lib/supabase";

// 학부모 결제요청 확인 모달 — 자녀가 올린 결제 요청을 결제하거나 반려한다.
//
// ⚠ 시안 없음. 확정 디자인(3967:3944)의 "결제 신청하기" 섹션은 표와
// `결제 진행하기` 칩까지만 그려져 있고 **반려 경로가 없다.** 그런데 반려가
// 없으면 자녀가 잘못 신청한 요청을 학부모가 치울 방법이 아예 없다(결제하거나
// 영원히 남거나 둘 중 하나). 서버에는 이미 fn_respond_enrollment(p_approve
// =false)가 있어서 화면만 붙였다. 노출 문구는 전부 신규 카피 — 승인 필요.
//
// 버튼은 [닫기|반려|결제] 3개 고정 — approval_status 와 무관하다. 서버가
// sql/86 부터 반려를 approved 건까지 허용해서(수락은 했지만 아직 결제 전),
// 화면에서 분기해 숨길 이유가 없어졌다. 반려 사유는 서버가 필수로 요구한다
// (WC025) — 자녀가 왜 반려됐는지 알아야 다시 신청할 수 있기 때문이다.
// 학생 쪽 뱃지 문구가 "학부모 반려"라 거절이 아닌 반려가 정본 용어.

const RESPOND_ERROR_TEXT = {
  WC021: "요청을 찾을 수 없습니다.",
  WC022: "이 요청에 응답할 권한이 없습니다.",
  WC023: "이미 처리된 요청입니다.",
  WC040: "이미 처리된 요청입니다.",
  WC025: "반려 사유를 입력해 주세요.",
};
const RESPOND_UNKNOWN_ERROR_TEXT =
  "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";

type EnrollmentOrder = {
  id: string;
  order_name?: string;
  amount: number;
  approval_status?: string;
  student_profile_id?: string;
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
    coupons?:
      | { title?: string | null }
      | { title?: string | null }[]
      | null;
  }[];
};

type EnrollmentRequestModalProps = {
  open: boolean;
  order: EnrollmentOrder | null;
  childName?: string;
  onClose: () => void;
  onRejected?: () => void;
};

export default function EnrollmentRequestModal({
  open,
  order,
  childName,
  onClose,
  onRejected,
}: EnrollmentRequestModalProps) {
  const titleId = useId();
  const navigate = useNavigate();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const reject = useCallback(async () => {
    if (!order?.id || saving) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setErrorMsg(RESPOND_ERROR_TEXT.WC025);
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const { error } = await supabase.rpc("fn_respond_enrollment", {
      p_order_id: order.id,
      p_approve: false,
      p_reject_reason: trimmed,
      p_coupon_ids: null,
    });

    setSaving(false);

    if (error) {
      console.error("결제 요청 거절 실패:", error);
      setErrorMsg(RESPOND_ERROR_TEXT[error.code] || RESPOND_UNKNOWN_ERROR_TEXT);
      return;
    }

    setRejecting(false);
    setReason("");
    onRejected?.();
  }, [order, saving, reason, onRejected]);

  if (!open || !order) return null;

  // 원금/할인 사유별/쿠폰명 분해는 EnrollmentRequestModal·PaymentDetailModal이
  // 공유하는 computeDiscountBreakdown(paymentRows.ts)에 정본으로 몰아뒀다 —
  // 두 화면이 각자 계산하면 같은 주문이 서로 다른 할인 내역으로 보일 수 있다.
  const { listAmount, discountRows, couponRows } =
    computeDiscountBreakdown(order);
  // 원금 → 할인 사유 행들 → 쿠폰 행들 → 결제 금액 순서로 렌더한다. 목록의
  // 첫 행만 상품명과 구분선(border-t)을 긋고, 나머지는 mt-3만 준다. 원금·결제
  // 금액은 일반 색(text-ink-strong), 할인·쿠폰 값만 음수 강조색(text-primary).
  const extraRows: {
    key: string;
    label: string;
    value: string;
    emphasize: boolean;
  }[] = [];
  if (listAmount > 0) {
    extraRows.push({
      key: "list-amount",
      label: "원금",
      value: formatKRW(listAmount),
      emphasize: false,
    });
  }
  for (const [i, row] of discountRows.entries()) {
    extraRows.push({
      key: `discount-${i}`,
      label: row.label,
      value: row.amountText,
      emphasize: true,
    });
  }
  for (const [i, row] of couponRows.entries()) {
    extraRows.push({
      key: `coupon-${i}`,
      label: row.label,
      value: row.amountText,
      emphasize: true,
    });
  }
  extraRows.push({
    key: "amount",
    label: "결제 금액",
    value: formatKRW(order.amount),
    emphasize: false,
  });

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="w-104"
    >
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2
          id={titleId}
          className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-title"
        >
          결제 요청을 확인해주세요
        </h2>

        <p className="mt-4 break-keep text-center text-[0.8125rem] leading-[1.6] text-ink-sub">
          {childName
            ? `${childName} 학생이 신청한 서비스예요.`
            : "자녀가 신청한 서비스예요."}
        </p>

        <div className="mt-6">
          <p
            className="truncate text-[0.9375rem] font-semibold text-ink"
            title={order.order_name}
          >
            {order.order_name}
          </p>
          {extraRows.map((row, i) => (
            <div
              key={row.key}
              className={`flex items-center justify-between text-[0.9375rem] font-semibold ${
                i === 0 ? "mt-3 border-t border-line pt-3" : "mt-3"
              }`}
            >
              <span className="text-ink">{row.label}</span>
              <span className={row.emphasize ? "text-primary" : "text-ink-strong"}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {rejecting && (
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="반려 사유를 입력해 주세요. 자녀에게 전달됩니다."
            className="mt-4 w-full resize-none rounded-xl border border-line px-4 py-3 text-[0.875rem] text-ink outline-hidden focus:border-accent"
          />
        )}

        {errorMsg && (
          <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
        )}
      </div>

      <div
        className={`grid gap-2 px-6 py-5 ${rejecting ? "grid-cols-2" : "grid-cols-3"}`}
      >
        {rejecting ? (
          <>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setReason("");
                setErrorMsg("");
              }}
              className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
            >
              취소
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={saving}
              className="h-12 rounded-xl bg-error text-[0.875rem] font-semibold text-white transition hover:bg-error/90 disabled:opacity-60"
            >
              {saving ? "처리 중..." : "반려하기"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="h-12 rounded-xl border border-error text-[0.875rem] font-semibold text-error transition hover:bg-error/10"
            >
              반려
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(`/checkout?order=${encodeURIComponent(order.id)}`)
              }
              className="h-12 rounded-xl bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90"
            >
              결제
            </button>
          </>
        )}
      </div>
    </MyPageModalShell>
  );
}
