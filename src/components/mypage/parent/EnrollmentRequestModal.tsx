import { useCallback, useId, useState } from "react";
import { useNavigate } from "react-router";
import MyPageModalShell from "@/components/mypage/MyPageModalShell";
import { formatKRW } from "@/data/pricingCatalog";
import { supabase } from "@/lib/supabase";

// 학부모 결제요청 확인 모달 — 자녀가 올린 결제 요청을 결제하거나 거절한다.
//
// ⚠ 시안 없음. 확정 디자인(3967:3944)의 "결제 신청하기" 섹션은 표와
// `결제 진행하기` 칩까지만 그려져 있고 **거절 경로가 없다.** 그런데 거절이
// 없으면 자녀가 잘못 신청한 요청을 학부모가 치울 방법이 아예 없다(결제하거나
// 영원히 남거나 둘 중 하나). 서버에는 이미 fn_respond_enrollment(p_approve
// =false)가 있어서 화면만 붙였다. 노출 문구는 전부 신규 카피 — 승인 필요.
//
// 거절 사유는 서버가 필수로 요구한다(WC025) — 자녀가 왜 반려됐는지 알아야
// 다시 신청할 수 있기 때문이다.

const RESPOND_ERROR_TEXT = {
  WC021: "요청을 찾을 수 없습니다.",
  WC022: "이 요청에 응답할 권한이 없습니다.",
  WC023: "이미 처리된 요청입니다.",
  WC040: "이미 처리된 요청입니다.",
  WC025: "거절 사유를 입력해 주세요.",
};
const RESPOND_UNKNOWN_ERROR_TEXT =
  "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";

type EnrollmentOrder = {
  id: string;
  order_name?: string;
  amount: number;
  approval_status?: string;
  student_profile_id?: string;
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

  // 수락까지 끝나고 결제창만 닫힌 건(approved)은 거절할 수 없다 —
  // fn_respond_enrollment 가 pending+requested 만 받는다(WC023/WC040).
  // 그 건은 결제를 마치거나 그대로 두는 수밖에 없다.
  const canReject = order.approval_status === "requested";

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="w-[26rem]"
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
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[0.9375rem] font-semibold">
            <span className="text-ink">결제 금액</span>
            <span className="text-ink-strong">{formatKRW(order.amount)}</span>
          </div>
        </div>

        {rejecting && (
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="거절 사유를 입력해 주세요. 자녀에게 전달됩니다."
            className="mt-4 w-full resize-none rounded-xl border border-line px-4 py-3 text-[0.875rem] text-ink outline-none focus:border-accent"
          />
        )}

        {errorMsg && (
          <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 px-6 py-5">
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
              {saving ? "처리 중..." : "거절하기"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => (canReject ? setRejecting(true) : onClose?.())}
              className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
            >
              {canReject ? "거절" : "닫기"}
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(`/checkout?order=${encodeURIComponent(order.id)}`)
              }
              className="h-12 rounded-xl bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90"
            >
              결제 진행하기
            </button>
          </>
        )}
      </div>
    </MyPageModalShell>
  );
}
