import { useCallback, useEffect, useId, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatKRW } from '../../data/pricingCatalog';
import MyPageModalShell from './MyPageModalShell';

// 환불 신청 모달 (Figma 3665:6635).
//
// 금액 3행(결제 금액 / 취소 수수료 / 환불 금액)은 **서버가 계산한다** —
// fn_refund_quote(sql/72_refund_policy_calc.sql)를 그대로 호출해 보여준다.
// 프런트에서 같은 계산을 다시 구현하지 않는 이유는, 실제로 기록되는 금액
// (fn_request_refund)이 이 함수를 쓰기 때문이다. 화면과 DB가 다른 숫자를
// 말하는 상황이 구조적으로 생길 수 없어야 한다.
//
// 계좌 3필드(은행/계좌번호/예금주)는 시안에 없어 뺐다. 환불은 원결제 수단으로
// 환급되고(RefundNoticeModal "결제하신 수단으로 환급해드려요"), fn_request_refund
// 의 해당 인자는 전부 default null 이라 안 보내도 된다. 현금 환급이 필요한
// 예외 건은 어드민이 처리한다.

const ETC_REASON = '기타 사유 (직접 입력)';

// 시안 실측 7종. 표시 순서까지 시안 그대로다.
const REASONS = [
  '단순 변심',
  '잘못된 상품 결제',
  '중복·오결제',
  '강의 내용·품질 불만족',
  '서비스 이용 장애',
  '강의 취소·폐강 등 운영상 사유',
  ETC_REASON
];

// 시안 노란 박스 문구(3665:6635 실측).
const POLICY_NOTICE =
  '지금 취소 시, 수수료가 부과됩니다. 이용을 시작한 서비스는 이용 기간·횟수분과 취소 수수료를 제외하고 환불돼요';

// fn_refund_quote.policy_code → 사용자 안내. 산정 규칙은 이용약관 제33조이며
// 코드 어휘는 sql/72 파일 상단 주석과 1:1 대응한다.
// ⚠ 아래 문구는 시안에 없는 신규 사용자 노출 카피다 — 도입 전 승인 필요.
const POLICY_TEXT = {
  before_start: '아직 이용을 시작하지 않아 전액 환불됩니다.',
  sessions_prorated: '사용하지 않은 잔여 횟수만큼 환불됩니다.',
  single_use_closed:
    '1회 이용권은 서비스가 시작된 후에는 환불이 제한됩니다(이용약관 제33조 ③).',
  period_tier: '이용 기간 경과분을 제외하고 환불됩니다(이용약관 제33조 ②).',
  period_prorated:
    '중도 환불 시 장기 할인이 취소되어 정가 기준으로 이용분을 정산합니다(이용약관 제33조 ⑧).',
  mixed: '상품별 규정에 따라 각각 산정한 금액을 합산했습니다.',
  no_grant: '이용 내역을 확인한 뒤 환불 금액이 확정됩니다.',
  period_unbounded: '이용 내역을 확인한 뒤 환불 금액이 확정됩니다.'
};

// fn_request_refund 의 서버측 거부 사유. WC005~WC007 문구는 기존
// PaymentsTab 의 것을 그대로 옮겼다(팀 리드 승인 문자열).
const REFUND_ERROR_TEXT = {
  WC005: '본인 주문이 아닙니다.',
  WC006: '결제가 확인된 주문만 환불 신청할 수 있습니다.',
  WC007: '이미 처리 중인 환불 신청이 있습니다.',
  // sql/69 에서 도입된 누적 환불액 가드. ⚠ 신규 카피 — 승인 필요.
  WC037: '이미 환불이 완료된 주문입니다.'
};
const REFUND_UNKNOWN_ERROR_TEXT = '환불 신청에 실패했습니다. 잠시 후 다시 시도해 주세요.';

const QUOTE_LOAD_ERROR_TEXT = '환불 금액을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';

export default function RefundRequestModal({ open, order, onClose, onSubmitted, onStaleData }) {
  const titleId = useId();

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [loading, setLoading] = useState(false);

  const [reason, setReason] = useState('');
  const [etcText, setEtcText] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const orderId = order?.id;

  // 열릴 때마다 산정을 새로 받는다. 회차 소비·기간 경과는 시간이 지나면
  // 바뀌므로 캐시하지 않는다.
  useEffect(() => {
    if (!open || !orderId) return undefined;
    let alive = true;

    setLoading(true);
    setQuote(null);
    setQuoteError('');
    setReason('');
    setEtcText('');
    setSubmitError('');

    (async () => {
      const { data, error } = await supabase.rpc('fn_refund_quote', { p_order_id: orderId });

      if (!alive) return;
      setLoading(false);

      if (error) {
        console.error('환불 금액 산정 실패:', error);
        setQuoteError(REFUND_ERROR_TEXT[error.code] || QUOTE_LOAD_ERROR_TEXT);
        return;
      }

      // RETURNS TABLE 이라 1행짜리 배열로 온다.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setQuoteError(QUOTE_LOAD_ERROR_TEXT);
        return;
      }
      setQuote(row);
    })();

    return () => {
      alive = false;
    };
  }, [open, orderId]);

  const handleSubmit = useCallback(async () => {
    if (!orderId || saving) return;

    const finalReason = reason === ETC_REASON ? etcText.trim() : reason;
    if (!finalReason) return;

    setSaving(true);
    setSubmitError('');

    // 금액은 보내지 않는다 — 서버가 fn_refund_quote 로 다시 산정해 기록한다.
    const { error } = await supabase.rpc('fn_request_refund', {
      p_order_id: orderId,
      p_reason: finalReason
    });

    setSaving(false);

    if (error) {
      console.error('환불 신청 저장 실패:', error);
      setSubmitError(
        error.code in REFUND_ERROR_TEXT ? REFUND_ERROR_TEXT[error.code] : REFUND_UNKNOWN_ERROR_TEXT
      );

      // 서버가 "이미 신청이 있다"(WC007) 또는 "이미 환불 완료"(WC037)라고
      // 하면 화면의 환불 목록이 낡았다는 뜻이다 — 이 화면을 연 뒤에(또는 다른
      // 탭/기기에서) 신청이 생긴 경우다. 목록을 다시 읽어 표의 상태 배지가
      // '환불 진행 중'으로 바뀌게 하고, 그러면 진입 버튼도 사라진다.
      // 이걸 안 하면 사용자가 같은 버튼을 계속 눌러 같은 에러만 반복해서 본다.
      if (error.code === 'WC007' || error.code === 'WC037') onStaleData?.();
      return;
    }

    onSubmitted?.();
  }, [orderId, reason, etcText, saving, onSubmitted, onStaleData]);

  if (!open || !order) return null;

  const refundAmount = quote ? Number(quote.refund_amount) : null;
  const feeAmount = quote ? Number(quote.fee_amount) : null;
  const grossAmount = quote ? Number(quote.gross_amount) : Number(order.amount);

  // 산정액이 0원이면 신청 버튼을 막는다. 신청을 접수시키면 학부모 본인 신청은
  // 즉시 승인(approval_status='approved')으로 들어가고, 어드민이 완료 처리하는
  // 순간 fn_complete_refund 가 권한을 회수한다 — 돈은 0원 돌려받고 이용 권한만
  // 잃는 결과가 된다. 예외 환불이 필요한 경우는 고객센터로 안내한다.
  // (DB 는 amount >= 0 을 허용한다 — 어드민이 예외 판단할 여지를 남긴 것이고,
  //  일반 사용자 경로에서 그 상태를 만들지 않는 것은 이 화면의 책임이다.)
  const blockedByPolicy = quote !== null && refundAmount === 0;

  const reasonFilled = Boolean(reason) && (reason !== ETC_REASON || etcText.trim().length > 0);
  const canSubmit = !loading && !quoteError && !blockedByPolicy && reasonFilled && !saving;

  const policyText = quote ? POLICY_TEXT[quote.policy_code] : '';

  return (
    <MyPageModalShell open={open} onClose={onClose} labelledBy={titleId} className="w-[26rem]">
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2 id={titleId} className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-title">
          환불을 신청할게요
        </h2>

        {/* 취소/환불 규정 안내 */}
        <p className="mt-6 text-[0.8125rem] font-semibold text-ink">취소/환불 규정 안내</p>
        <p className="mt-2 whitespace-pre-line break-keep rounded-xl bg-[#FFF7E0] px-4 py-3 text-[0.8125rem] leading-relaxed text-[#8A6D1F]">
          {POLICY_NOTICE}
        </p>

        {/* 금액 3행 */}
        <div className="mt-6">
          <p className="truncate text-[0.9375rem] font-semibold text-ink" title={order.order_name}>
            {order.order_name}
          </p>

          {loading ? (
            <p className="mt-3 text-[0.875rem] text-ink-sub">환불 금액 계산 중...</p>
          ) : quoteError ? (
            <p className="mt-3 text-[0.875rem] text-error">{quoteError}</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[0.875rem]">
                <span className="text-ink-sub">결제 금액</span>
                <span className="text-ink-strong">{formatKRW(grossAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-[0.875rem]">
                <span className="text-ink-sub">취소 수수료</span>
                <span className="text-error">
                  {feeAmount > 0 ? `-${formatKRW(feeAmount)}` : formatKRW(0)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-2 text-[0.9375rem] font-semibold">
                <span className="text-ink">환불 금액</span>
                <span className="text-ink-strong">{formatKRW(refundAmount)}</span>
              </div>

              {policyText && (
                <p className="break-keep text-[0.75rem] leading-relaxed text-ink-sub">{policyText}</p>
              )}
            </div>
          )}
        </div>

        {/* 사유 선택 — 환불 금액이 0원이면 고를 필요가 없으므로 숨긴다. */}
        {!blockedByPolicy && (
          <div className="mt-6 flex flex-col gap-2 pb-2">
            {REASONS.map((item) => {
              const selected = reason === item;
              return (
                <label
                  key={item}
                  className={`flex h-[3rem] cursor-pointer items-center gap-3 rounded-xl border px-4 transition ${
                    selected ? 'border-accent bg-surface-info' : 'border-line'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      selected ? 'border-accent' : 'border-line'
                    }`}
                  >
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                  </span>
                  <input
                    type="radio"
                    name="refund-reason"
                    value={item}
                    checked={selected}
                    onChange={() => setReason(item)}
                    className="sr-only"
                  />
                  <span className="text-[0.875rem] text-ink">{item}</span>
                </label>
              );
            })}

            {reason === ETC_REASON && (
              // 시안 placeholder 는 "탈퇴 사유를 직접 입력해주세요"인데, 회원 탈퇴
              // 모달에서 복사되며 남은 오타로 보인다(여기는 환불 모달이다).
              // "환불 사유"로 고쳐 쓴다 — 디자이너 확인 필요.
              <input
                type="text"
                value={etcText}
                onChange={(e) => setEtcText(e.target.value)}
                placeholder="환불 사유를 직접 입력해주세요"
                className="h-[3rem] w-full rounded-xl border border-line px-4 text-[0.875rem] text-ink outline-none focus:border-accent"
              />
            )}
          </div>
        )}

        {blockedByPolicy && (
          // ⚠ 신규 카피 — 승인 필요.
          <p className="mt-4 break-keep rounded-xl bg-[#FCEAEE] px-4 py-3 text-[0.8125rem] leading-relaxed text-[#D6336C]">
            이 주문은 환불 가능 금액이 없어 신청을 접수할 수 없습니다. 서비스 이용에 문제가 있었다면
            고객센터로 문의해 주세요.
          </p>
        )}

        {submitError && <p className="mt-4 text-[0.875rem] text-error">{submitError}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2 px-6 py-5">
        <button
          type="button"
          onClick={onClose}
          className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`h-12 rounded-xl text-[0.875rem] font-semibold text-white transition ${
            canSubmit ? 'bg-error hover:bg-error/90' : 'cursor-not-allowed bg-line'
          }`}
        >
          {saving ? '접수 중...' : '환불 하기'}
        </button>
      </div>
    </MyPageModalShell>
  );
}
