import { useCallback, useId, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { formatKRW } from '../../../data/pricingCatalog';
import MyPageModalShell from '../MyPageModalShell';

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

const RESPOND_ERROR_TEXT = {
  WC026: '이미 처리된 환불 요청입니다.',
  WC027: '이 환불 요청에 응답할 권한이 없습니다.',
  WC028: '이미 응답한 환불 요청입니다.',
  WC029: '반려 사유를 입력해 주세요.'
};
const RESPOND_UNKNOWN_ERROR_TEXT = '처리에 실패했습니다. 잠시 후 다시 시도해 주세요.';

export default function RefundApprovalModal({ open, request, childName, onClose, onResponded }) {
  const titleId = useId();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const respond = useCallback(
    async (approve) => {
      if (!request?.id || saving) return;
      const reason = approve ? null : rejectReason.trim();
      if (!approve && !reason) {
        setErrorMsg(RESPOND_ERROR_TEXT.WC029);
        return;
      }

      setSaving(true);
      setErrorMsg('');

      const { error } = await supabase.rpc('fn_respond_refund', {
        p_refund_request_id: request.id,
        p_approve: approve,
        p_reject_reason: reason
      });

      setSaving(false);

      if (error) {
        console.error('환불 요청 응답 실패:', error);
        setErrorMsg(RESPOND_ERROR_TEXT[error.code] || RESPOND_UNKNOWN_ERROR_TEXT);
        return;
      }

      setRejecting(false);
      setRejectReason('');
      onResponded?.();
    },
    [request, saving, rejectReason, onResponded]
  );

  if (!open || !request) return null;

  // gross_amount 는 sql/72 이전 행에는 없다(NULL) — 그때는 수수료를 산출할
  // 근거가 없으므로 환불액만 보여준다.
  const gross = request.gross_amount ? Number(request.gross_amount) : null;
  const refund = Number(request.amount || 0);
  const fee = gross === null ? null : gross - refund;

  return (
    <MyPageModalShell open={open} onClose={onClose} labelledBy={titleId} className="w-[26rem]">
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2 id={titleId} className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-title">
          환불 요청을 확인해주세요
        </h2>

        <p className="mt-4 break-keep text-center text-[0.8125rem] leading-[1.6] text-ink-sub">
          {childName ? `${childName} 학생이 환불을 요청했어요.` : '자녀가 환불을 요청했어요.'}
          <br />
          승인하면 검토 후 결제하신 수단으로 환급됩니다.
        </p>

        <div className="mt-6">
          <p className="truncate text-[0.9375rem] font-semibold text-ink" title={request.order_name}>
            {request.order_name}
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {gross !== null && (
              <>
                <div className="flex items-center justify-between text-[0.875rem]">
                  <span className="text-ink-sub">결제 금액</span>
                  <span className="text-ink-strong">{formatKRW(gross)}</span>
                </div>
                <div className="flex items-center justify-between text-[0.875rem]">
                  <span className="text-ink-sub">취소 수수료</span>
                  <span className="text-error">{fee > 0 ? `-${formatKRW(fee)}` : formatKRW(0)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between border-t border-line pt-2 text-[0.9375rem] font-semibold">
              <span className="text-ink">환불 금액</span>
              <span className="text-ink-strong">{formatKRW(refund)}</span>
            </div>
          </div>

          {request.reason && (
            <p className="mt-4 break-keep rounded-xl bg-surface-04 px-4 py-3 text-[0.8125rem] leading-relaxed text-ink-sub">
              요청 사유 · {request.reason}
            </p>
          )}
        </div>

        {rejecting && (
          <textarea
            rows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="반려 사유를 입력해 주세요."
            className="mt-4 w-full resize-none rounded-xl border border-line px-4 py-3 text-[0.875rem] text-ink outline-none focus:border-accent"
          />
        )}

        {errorMsg && <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2 px-6 py-5">
        {rejecting ? (
          <>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setRejectReason('');
                setErrorMsg('');
              }}
              className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => respond(false)}
              disabled={saving}
              className="h-12 rounded-xl bg-error text-[0.875rem] font-semibold text-white transition hover:bg-error/90 disabled:opacity-60"
            >
              {saving ? '처리 중...' : '반려하기'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={saving}
              className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30 disabled:opacity-60"
            >
              반려
            </button>
            <button
              type="button"
              onClick={() => respond(true)}
              disabled={saving}
              className="h-12 rounded-xl bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? '처리 중...' : '환불 승인'}
            </button>
          </>
        )}
      </div>
    </MyPageModalShell>
  );
}
