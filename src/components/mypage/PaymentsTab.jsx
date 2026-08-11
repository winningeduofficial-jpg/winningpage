import { Fragment, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatKRW } from '../../data/pricingCatalog';
import PaymentStatusBadge from './PaymentStatusBadge';
import ReceiptModal from './ReceiptModal';
import RefundNoticeModal from './RefundNoticeModal';

// 결제/환불 내역 탭 (Figma 3762:18907 표 + 3762:19227/3762:19708 모달).
//
// 환불 신청 폼은 원래 src/pages/MyPage.jsx의 submitRefund에 있던 것을 옮겨왔다(UI만
// 표 아래 담백한 폼으로 재정리). insert 로직은 dev에서 서버 RPC(fn_request_refund,
// sql/59_refund_request_hardening.sql)로 하드닝됐다 — 주문 소유권·결제 상태(paid)·
// 중복 신청을 서버가 강제하고 금액도 클라이언트가 보내지 않는다. 이 탭은 그 RPC를
// 그대로 호출한다(rebase로 dev 위에 얹으며 이식, 2026-08-12). 로컬 QA 전용 가짜
// 이용권 주문(is_fake_entitlement)은 환불 대상에서 반드시 제외한다 — 가짜 id로
// 환불을 걸면 존재하지 않는 order_id가 refund_requests에 저장된다.
const REFUND_EMPTY = { orderId: '', reason: '', bank: '', account: '', holder: '' };

// fn_request_refund 하드닝으로 새로 생긴 서버측 거부 사유 3종. 문구는 팀 리드가 승인한
// 코퍼스 규범 문자열이다(2026-08-11, Checkout.jsx COUPON_REASON_TEXT 와 동일 패턴).
// 이 3종 밖의 "알 수 없는 오류"는 REFUND_UNKNOWN_ERROR_TEXT 로 명시 분기한다 —
// "문구가 없어서 대체"가 아니라 별개 사례다(feat(copy) ab5a657, 폴백 체인 금지).
const REFUND_ERROR_TEXT = {
  WC005: '본인 주문이 아닙니다.',
  WC006: '결제가 확인된 주문만 환불 신청할 수 있습니다.',
  WC007: '이미 처리 중인 환불 신청이 있습니다.'
};
const REFUND_UNKNOWN_ERROR_TEXT = '환불 신청에 실패했습니다. 잠시 후 다시 시도해 주세요.';

function cleanText(value) {
  return String(value || '').trim();
}

// 승인 일시 YYYY/MM/DD 포맷 (요구사항 1).
function formatApprovedAt(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (!y || !m || !d) return raw;
  return `${y}/${m}/${d}`;
}

// 표시용 주문번호 축약. 시안(9자리 숫자, 예: 123283945)은 그대로 두고, 실데이터의
// 토스 orderId(order_1785898468780_adf9e6aa, sql/10_pricing_orders.sql)처럼 긴 값만
// order_ 접두어를 떼고 뒤쪽 10자만 남겨 220px 컬럼을 넘지 않게 한다. 원본은 title 속성에
// 그대로 남아 있으므로(아래 버튼) hover로 전체 값을 확인할 수 있다.
function formatOrderId(id) {
  const raw = String(id || '');
  const stripped = raw.startsWith('order_') ? raw.slice('order_'.length) : raw;
  if (stripped.length <= 12) return stripped;
  return `…${stripped.slice(-10)}`;
}

// order + 매칭되는 refund_requests 최신 행으로 표에 보여줄 상태를 계산한다.
// refunds는 상위(MyPage)에서 created_at desc로 정렬해 내려주므로 첫 매칭이 최신 건이다.
function resolveStatus(order, refunds) {
  // 가상계좌 미입금(waiting_deposit)은 환불 신청 대상이 아니므로 refunds 매칭보다 먼저
  // 본다 — 돈이 안 들어온 주문이라 refund_requests 행이 있을 수 없다(PaymentStatusBadge의
  // pending = 시안 "입금대기").
  if (order.status === 'waiting_deposit') return { status: 'pending' };
  const refund = refunds.find((r) => r.order_id === order.id);
  if (!refund) return { status: 'paid' };
  if (refund.status === 'completed') return { status: 'refund_completed' };
  if (refund.status === 'rejected') return { status: 'refund_rejected' };
  // requested/processing 모두 시안 표기는 "환불 진행 중" 하나로 통일.
  return { status: 'refund_requested' };
}

export default function PaymentsTab({ user, orders = [], refunds = [], onRefundSubmitted }) {
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [refundForm, setRefundForm] = useState(REFUND_EMPTY);
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundMsg, setRefundMsg] = useState('');
  // 시안(3762:18907)에는 환불 신청 폼이 없다 — 기본은 접힌 상태, 표 아래 텍스트
  // 버튼으로만 펼친다(기능 삭제 아님, UI만 재정리).
  const [refundOpen, setRefundOpen] = useState(false);

  // 환불 신청 대상은 실제 입금이 확인된 주문(paid)뿐이다. 가상계좌 미입금
  // (waiting_deposit) 건은 아직 들어온 돈이 없어 환불할 대상이 아니므로 제외한다.
  // 로컬 QA 전용 가짜 이용권 주문(is_fake_entitlement)도 함께 제외한다 — 폼 선택
  // 목록과 RPC 호출 가드 양쪽에 사용.
  const refundableOrders = orders.filter((o) => o.status === 'paid' && !o.is_fake_entitlement);

  function updateRefund(key, value) {
    setRefundForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitRefund(e) {
    e.preventDefault();
    if (!user) return;

    const order = refundableOrders.find((o) => o.id === refundForm.orderId);
    if (!order) {
      setRefundMsg('환불할 결제 내역을 선택해 주세요.');
      return;
    }
    if (!cleanText(refundForm.reason)) {
      setRefundMsg('환불 사유를 입력해 주세요.');
      return;
    }

    setRefundSaving(true);
    setRefundMsg('');

    // 주문 소유권·결제 상태(paid)·중복 신청은 서버(fn_request_refund)가 강제한다.
    // 금액도 클라이언트가 보내지 않는다 — 서버가 orders.amount 를 그대로 쓴다
    // (sql/59_refund_request_hardening.sql). status 도 함수가 'requested' 로
    // 고정하므로 여기서 지정하지 않는다.
    const { error } = await supabase.rpc('fn_request_refund', {
      p_order_id: order.id,
      p_reason: cleanText(refundForm.reason),
      p_refund_bank: cleanText(refundForm.bank) || null,
      p_refund_account: cleanText(refundForm.account) || null,
      p_refund_holder: cleanText(refundForm.holder) || null
    });

    setRefundSaving(false);

    if (error) {
      console.error('환불 신청 저장 실패:', error);
      // 명시적 분기 — 알려진 코드(WC005/WC006/WC007)는 REFUND_ERROR_TEXT 를, 그 밖의
      // 알 수 없는 코드는 REFUND_UNKNOWN_ERROR_TEXT 를 쓴다.
      setRefundMsg(
        error.code in REFUND_ERROR_TEXT ? REFUND_ERROR_TEXT[error.code] : REFUND_UNKNOWN_ERROR_TEXT
      );
      return;
    }

    setRefundForm(REFUND_EMPTY);
    setNoticeOpen(true);
    onRefundSubmitted?.();
  }

  return (
    <section>
      <h2 className="text-[1.5rem] font-semibold text-ink">결제내역</h2>

      {orders.length === 0 ? (
        <p className="mt-6 rounded-lg border border-line bg-surface-04 px-5 py-6 text-center text-sm text-ink-sub">
          결제 내역이 없습니다.
        </p>
      ) : (
        // 콘텐츠 폭(최대 1100px, MyPage.jsx maxWidth)을 표가 강제로 넘기지 않도록 w-full 기반
        // 그리드로 구성한다. 컬럼폭은 시안 실측(주문번호/승인일시 각 220px, 금액/상태는 우측
        // 정렬 배지 폭에 맞춘 고정폭)을 기준으로 하되, 상품만 minmax(0,1fr)로 남는 폭을
        // 채운다 — 바깥 1fr은 grid item의 기본 최소폭(min-content)이 긴 상품명에서 열 합이
        // 컨테이너를 넘겨 배지를 잘라내므로, min을 0으로 강제해 실제로 줄어들 수 있게 한다.
        // 좁은 화면 대비 overflow-x-auto는 유지하되 1100px 부모에서는 스크롤이 생기지 않는다.
        <div className="mt-[4.4375rem] overflow-x-auto">
          <div className="w-full text-sm">
            <div className="grid grid-cols-[13.75rem_13.75rem_minmax(0,1fr)_9rem_7rem] gap-x-2 border-b border-line pb-[0.625rem] text-sm font-semibold text-ink-sub">
              <span>주문번호</span>
              <span>승인 일시</span>
              <span>상품</span>
              <span className="text-right">결제 금액</span>
              <span className="text-right">상태</span>
            </div>

            <div className="grid grid-cols-[13.75rem_13.75rem_minmax(0,1fr)_9rem_7rem] gap-x-2 gap-y-5 pt-[1.25rem]">
              {orders.map((order) => {
                const { status } = resolveStatus(order, refunds);
                return (
                  <Fragment key={order.id}>
                    {/* orders.id = 토스 orderId(sql/10_pricing_orders.sql) — 별도 order_number
                        컬럼이 없어 이 값 자체가 주문번호다. 실데이터는 시안(9자리 숫자)보다
                        훨씬 길어 표시는 formatOrderId로 축약하고 원본은 title에 남긴다. */}
                    <button
                      type="button"
                      onClick={() => setReceiptOrder(order)}
                      title={order.id}
                      className="h-8 truncate self-center text-left text-accent underline underline-offset-2"
                    >
                      {formatOrderId(order.id)}
                    </button>
                    <span className="flex h-8 items-center truncate text-ink-sub">
                      {formatApprovedAt(order.paid_at)}
                    </span>
                    <span className="flex h-8 items-center truncate text-ink-strong">
                      {order.order_name}
                      {order.is_fake_entitlement && (
                        <span className="ml-1.5 shrink-0 text-xs text-ink-sub">(개발용)</span>
                      )}
                    </span>
                    <span className="flex h-8 items-center justify-end truncate text-ink-strong">
                      {formatKRW(order.amount)}
                    </span>
                    <span className="flex h-8 items-center justify-end">
                      <PaymentStatusBadge status={status} />
                    </span>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 환불 신청 폼 — 원본 MyPage.jsx submitRefund 로직 이식(기능 불변). 시안(3762:18907)에는
          폼이 없어 기본은 접힌 상태로 두고, 표 아래 담백한 텍스트 버튼으로만 펼친다. */}
      {refundOpen ? (
        <div className="mt-10 border-t border-line pt-8">
          <button
            type="button"
            onClick={() => setRefundOpen(false)}
            className="text-sm text-ink-sub underline underline-offset-2 hover:text-ink"
          >
            환불 신청 접기
          </button>

          <h3 className="mt-4 text-base font-semibold text-ink">환불 신청</h3>

          {refundableOrders.length === 0 ? (
            <p className="mt-4 text-sm text-ink-sub">환불 신청 가능한 결제 내역이 없습니다.</p>
          ) : (
            <form onSubmit={submitRefund} className="mt-4 grid gap-4 sm:max-w-[28rem]">
              <label className="block">
                <span className="text-xs font-semibold text-ink-sub">환불할 결제 내역</span>
                <select
                  className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  value={refundForm.orderId}
                  onChange={(e) => updateRefund('orderId', e.target.value)}
                >
                  <option value="">결제 내역 선택</option>
                  {refundableOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_name} · {formatKRW(o.amount)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-ink-sub">환불 사유</span>
                <textarea
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  value={refundForm.reason}
                  onChange={(e) => updateRefund('reason', e.target.value)}
                  placeholder="환불 사유를 입력해 주세요."
                />
              </label>

              <div className="grid grid-cols-3 gap-2">
                <input
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  value={refundForm.bank}
                  onChange={(e) => updateRefund('bank', e.target.value)}
                  placeholder="은행명"
                />
                <input
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  value={refundForm.account}
                  onChange={(e) => updateRefund('account', e.target.value)}
                  placeholder="계좌번호"
                />
                <input
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  value={refundForm.holder}
                  onChange={(e) => updateRefund('holder', e.target.value)}
                  placeholder="예금주"
                />
              </div>
              <p className="text-xs text-ink-sub">
                ※ 카드 결제 건은 원칙적으로 원결제 취소(카드 취소)로 환불되며, 계좌 정보는 부분·현금
                환불 시 사용됩니다.
              </p>

              {refundMsg && <p className="text-sm text-ink">{refundMsg}</p>}

              <button
                type="submit"
                disabled={refundSaving}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw size={16} />
                {refundSaving ? '접수 중...' : '환불 신청'}
              </button>
            </form>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRefundOpen(true)}
          className="mt-6 text-sm text-ink-sub underline underline-offset-2 hover:text-ink"
        >
          환불 신청
        </button>
      )}

      <ReceiptModal open={!!receiptOrder} order={receiptOrder} onClose={() => setReceiptOrder(null)} />
      <RefundNoticeModal open={noticeOpen} onClose={() => setNoticeOpen(false)} />
    </section>
  );
}
