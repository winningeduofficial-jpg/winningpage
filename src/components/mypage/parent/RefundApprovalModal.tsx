import { useCallback, useEffect, useState } from "react";
import { useBundleCompositionMap } from "@/components/mypage/bundleComposition";
import MyPageModalShell from "@/components/mypage/MyPageModalShell";
import ModalFooter from "@/components/mypage/modal/ModalFooter";
import RefundAmountSummary from "@/components/mypage/modal/RefundAmountSummary";
import RejectReasonField from "@/components/mypage/modal/RejectReasonField";
import RefundAccountFields from "@/components/mypage/RefundAccountFields";
import { formatKRW } from "@/data/pricingCatalog";
import type { VirtualAccountInfo } from "@/hooks/usePaymentConfirmation";
import { supabase } from "@/lib/supabase";

// 학부모 환불 확인 모달 — 자녀가 보낸 환불 요청을 승인/반려한다.
//
// **금액은 여기서만 보여준다**(2026-08-13 사용자 확정). 학생 요청 모달
// (3967:3561)에는 결제 금액·취소 수수료·환불 금액이 없다 — 학생은 사유만
// 고르고, 얼마가 돌아가는지는 결제 주체인 학부모가 확인한다.
//
// ⚠ 시안 없음 — 확정 디자인의 학부모 "환불요청" 섹션(3967:3944)은 표와 상태
// 칩까지만 그려져 있고 승인/반려를 어디서 하는지는 없다. 표 행을 눌러 여는
// 확인 모달로 구현했다(기존 결제 상세 모달과 같은 진입 관례). 노출 문구는
// 전부 신규 카피라 승인이 필요하다.
//
// 승인축(approval_status)과 처리축(status)은 별개다 — 여기서 승인해도 실제
// 환불 실행은 어드민이 한다(fn_complete_refund). 승인은 "어드민이 처리해도
// 좋다"는 잠금 해제일 뿐이다.
//
// 환불계좌 3필드(2026-08-22 추가) — 학생이 신청한 환불을 승인하는 화면이라,
// 그 주문이 가상계좌 결제면 학부모가 여기서 환불계좌를 입력해야 한다
// (fn_respond_refund가 승인 시 함께 받는다, WC058). 학부모 직접 신청 경로
// (RefundRequestModal)와 입력 시점이 다를 뿐 필드 UI는 RefundAccountFields를
// 공유한다.

const RESPOND_ERROR_TEXT = {
  WC026: "이미 처리된 환불 요청입니다.",
  WC027: "이 환불 요청에 응답할 권한이 없습니다.",
  WC028: "이미 응답한 환불 요청입니다.",
  WC029: "반려 사유를 입력해 주세요.",
  WC058: "가상계좌 환불은 환불계좌(은행/계좌번호/예금주) 입력이 필요합니다.",
};
const RESPOND_UNKNOWN_ERROR_TEXT =
  "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";

type RefundRequestRow = {
  // refund_requests.id는 bigint PK다(orders.id와 달리 uuid가 아니다) —
  // fn_respond_refund(p_refund_request_id: number)도 이 값을 그대로 받는다.
  id: number;
  order_id?: string;
  order_name?: string | null;
  amount: number;
  gross_amount?: number | null;
  reason?: string | null;
  student_profile_id?: string;
  // v10 구성서비스 단위 부분해지 — 산정 라인 배열(jsonb). 레거시 v9 행은 키
  // 구성이 달라(order_item_id 없음) 소비 측에서 방어적으로 파싱한다.
  quote?: unknown;
  // NULL/빈 배열이면 주문 전체 환불, 값이 있으면 그 order_item_id 들만 대상.
  order_item_ids?: number[] | null;
};

type RefundQuoteLine = {
  order_item_id?: number;
  item_name?: string;
  paid_allocated?: number;
  refund?: number;
};

function parseQuoteLines(quote: unknown): RefundQuoteLine[] {
  if (!Array.isArray(quote)) return [];
  return quote.filter(
    (line): line is RefundQuoteLine =>
      typeof line === "object" && line !== null,
  );
}

type RefundApprovalModalProps = {
  open: boolean;
  request: RefundRequestRow | null;
  virtualAccount?: VirtualAccountInfo | null;
  childName?: string;
  onClose: () => void;
  onResponded?: () => void;
};

export default function RefundApprovalModal({
  open,
  request,
  virtualAccount,
  childName,
  onClose,
  onResponded,
}: RefundApprovalModalProps) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [refundBank, setRefundBank] = useState("");
  const [refundAccount, setRefundAccount] = useState("");
  const [refundHolder, setRefundHolder] = useState("");

  // order_item_id → product_id — 구성 이용권 내역(bundleComposition) 조회
  // 키. RefundRequestModal과 같은 근거로 직접 읽는다(request prop에는
  // product_id가 없다).
  const [orderItemProductIds, setOrderItemProductIds] = useState<
    Record<number, string | null>
  >({});
  const bundleMap = useBundleCompositionMap(Object.values(orderItemProductIds));

  useEffect(() => {
    setOrderItemProductIds({});
    const orderId = request?.order_id;
    if (!open || !orderId) return;
    let alive = true;
    supabase
      .from("order_items")
      .select("id, product_id")
      .eq("order_id", orderId)
      .then(({ data, error }) => {
        if (!alive || error || !data) return;
        const map: Record<number, string | null> = {};
        for (const row of data) map[row.id] = row.product_id ?? null;
        setOrderItemProductIds(map);
      });
    return () => {
      alive = false;
    };
  }, [open, request?.order_id]);

  const isVirtualAccountOrder = Boolean(virtualAccount);

  // request가 바뀔 때마다(다른 신청 건을 열 때) 계좌 입력을 새로 시작한다.
  // 결제 시점에 이미 환불계좌가 있으면(가상계좌 refundReceiveAccount) 프리필한다.
  // virtualAccount는 상위(ParentPaymentsTab)가 매 렌더 orders.find(...)로 새로
  // 계산해 내려주는 파생값이라 deps에 넣으면 입력 중인 계좌 값이 다른 이유의
  // 재렌더로 초기화된다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: request?.id(스칼라) 하나로 "다른 신청 건을 열었는가"만 판별한다.
  useEffect(() => {
    const prefill = virtualAccount?.refundReceiveAccount;
    setRefundBank(prefill?.bank || "");
    setRefundAccount(prefill?.accountNumber || "");
    setRefundHolder(prefill?.holderName || "");
  }, [request?.id]);

  const accountFieldsValid =
    !isVirtualAccountOrder ||
    (Boolean(refundBank) &&
      refundAccount.trim().length > 0 &&
      refundHolder.trim().length > 0);

  const respond = useCallback(
    async (approve: boolean) => {
      if (!request?.id || saving) return;
      const reason = approve ? null : rejectReason.trim();
      if (!approve && !reason) {
        setErrorMsg(RESPOND_ERROR_TEXT.WC029);
        return;
      }
      if (approve && !accountFieldsValid) {
        setErrorMsg(RESPOND_ERROR_TEXT.WC058);
        return;
      }

      setSaving(true);
      setErrorMsg("");

      const { error } = await supabase.rpc("fn_respond_refund", {
        p_refund_request_id: request.id,
        p_approve: approve,
        // p_reject_reason은 DEFAULT NULL이 있는 optional 인자다. exactOptionalPropertyTypes
        // 하에서는 명시적 null도 금지라 키 자체를 조건부로 스프레드한다(reason은
        // approve=true일 때 항상 null이라 이 경우 인자를 생략해도 동일하다).
        ...(reason ? { p_reject_reason: reason } : {}),
        // 가상계좌 결제 건만 실어 보낸다(RefundRequestModal과 같은 이유).
        ...(approve && isVirtualAccountOrder
          ? {
              p_refund_bank: refundBank,
              p_refund_account: refundAccount.trim(),
              p_refund_holder: refundHolder.trim(),
            }
          : {}),
      });

      setSaving(false);

      if (error) {
        console.error("환불 요청 응답 실패:", error);
        setErrorMsg(
          RESPOND_ERROR_TEXT[error.code] || RESPOND_UNKNOWN_ERROR_TEXT,
        );
        return;
      }

      setRejecting(false);
      setRejectReason("");
      onResponded?.();
    },
    [
      request,
      saving,
      rejectReason,
      onResponded,
      accountFieldsValid,
      isVirtualAccountOrder,
      refundBank,
      refundAccount,
      refundHolder,
    ],
  );

  if (!open || !request) return null;

  // gross_amount 는 sql/72 이전 행에는 없다(NULL) — 그때는 수수료를 산출할
  // 근거가 없으므로 환불액만 보여준다.
  const gross = request.gross_amount ? Number(request.gross_amount) : null;
  const refund = Number(request.amount || 0);
  const quoteLines = parseQuoteLines(request.quote);
  const isPartial = Boolean(
    request.order_item_ids && request.order_item_ids.length > 0,
  );
  const paidAllocatedSum =
    quoteLines.length > 0
      ? quoteLines.reduce((sum, l) => sum + (l.paid_allocated ?? 0), 0)
      : null;
  // 부분해지(구성서비스 단위)는 gross(주문 전액)를 base로 쓰면 아직 남아 있는
  // 다른 서비스분까지 이번 건의 공제로 오인된다 — quote 라인의 paid_allocated
  // (안분결제액) 합을 base로 쓴다. 못 구하면(레거시 v9 등) 기존 gross 기반을
  // 유지한다.
  const feeBase =
    isPartial && paidAllocatedSum !== null ? paidAllocatedSum : gross;
  const fee = feeBase === null ? null : Math.max(0, feeBase - refund);

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="sm"
      title="환불 요청을 확인해주세요"
      subtitle={
        <>
          {childName
            ? `${childName} 학생이 환불을 요청했어요.`
            : "자녀가 환불을 요청했어요."}
          <br />
          승인하면 검토 후 결제하신 수단으로 환급됩니다.
        </>
      }
      footer={
        rejecting ? (
          <ModalFooter
            buttons={[
              {
                key: "cancel",
                label: "취소",
                variant: "neutral",
                onClick: () => {
                  setRejecting(false);
                  setRejectReason("");
                  setErrorMsg("");
                },
              },
              {
                key: "reject",
                label: saving ? "처리 중..." : "반려하기",
                variant: "destructive",
                disabled: saving,
                onClick: () => respond(false),
              },
            ]}
          />
        ) : (
          <ModalFooter
            buttons={[
              {
                key: "close",
                label: "닫기",
                variant: "neutral",
                onClick: onClose,
              },
              {
                key: "reject",
                label: "반려",
                variant: "destructive-outline",
                disabled: saving,
                onClick: () => setRejecting(true),
              },
              {
                key: "approve",
                label: saving ? "처리 중..." : "환불 승인",
                variant: "primary",
                disabled: saving || !accountFieldsValid,
                onClick: () => respond(true),
              },
            ]}
          />
        )
      }
    >
      <div className="flex-1 overflow-y-auto px-6">
        <div className="mt-6">
          <p
            className="truncate text-[0.9375rem] font-semibold text-ink"
            title={request.order_name ?? undefined}
          >
            {request.order_name}
          </p>

          {/* 구성 이용권 내역(bundleComposition) — 라인이 1개뿐(번들, 부분환불
              없음)이라 아래 "항목별 내역" 박스가 안 뜰 때만 제목 바로 아래
              붙는다. 금액 없이 구성만 — RefundRequestModal과 같은 방침. */}
          {quoteLines.length === 1 &&
            (() => {
              const soleLine = quoteLines[0];
              const note =
                soleLine != null
                  ? (bundleMap.get(
                      orderItemProductIds[soleLine.order_item_id ?? -1] || "",
                    ) ?? [])
                  : [];
              if (note.length === 0) return null;
              return (
                <div className="mt-1.5 flex flex-col gap-0.5 pl-1">
                  {note.map((line) => (
                    <p key={line} className="text-xs text-ink-sub">
                      {line}
                    </p>
                  ))}
                </div>
              );
            })()}

          {/* ⚠ 신규 카피 — 승인 필요. */}
          {isPartial && (
            <p className="mt-2 break-keep text-[0.8125rem] leading-relaxed text-ink-sub">
              선택 항목만 환불하는 신청입니다. 나머지 서비스는 계속 이용할 수
              있어요.
            </p>
          )}

          {quoteLines.length >= 2 && (
            <div className="mt-3 flex flex-col gap-1 rounded-xl bg-surface-04 px-4 py-3 text-[0.8125rem]">
              <p className="font-semibold text-ink">항목별 내역</p>
              {quoteLines.map((line, i) => {
                const note =
                  bundleMap.get(
                    orderItemProductIds[line.order_item_id ?? -1] || "",
                  ) ?? [];
                return (
                  <div key={line.item_name ?? i}>
                    <div className="flex items-center justify-between text-ink-sub">
                      <span>{line.item_name ?? "-"}</span>
                      <span className="text-ink-strong">
                        {formatKRW(line.refund ?? 0)}
                      </span>
                    </div>
                    {note.length > 0 && (
                      <div className="flex flex-col gap-0.5 pl-3">
                        {note.map((n) => (
                          <p key={n} className="text-xs text-ink-sub">
                            {n}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <RefundAmountSummary gross={gross} fee={fee} refund={refund} />

          {request.reason && (
            <p className="mt-4 break-keep rounded-xl bg-surface-04 px-4 py-3 text-[0.8125rem] leading-relaxed text-ink-sub">
              요청 사유 · {request.reason}
            </p>
          )}
        </div>

        {isVirtualAccountOrder && !rejecting && (
          <RefundAccountFields
            bank={refundBank}
            account={refundAccount}
            holder={refundHolder}
            onBankChange={setRefundBank}
            onAccountChange={setRefundAccount}
            onHolderChange={setRefundHolder}
          />
        )}

        {rejecting && (
          <RejectReasonField
            value={rejectReason}
            onChange={setRejectReason}
            placeholder="반려 사유를 입력해 주세요."
          />
        )}

        {errorMsg && (
          <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
        )}
      </div>
    </MyPageModalShell>
  );
}
