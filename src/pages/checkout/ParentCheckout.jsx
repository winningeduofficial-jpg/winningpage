import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getTossPayments, ANONYMOUS } from '../../lib/toss';
import { formatKRW } from '../../data/pricingCatalog';
import ConfirmModal from '../../components/checkout/ConfirmModal';

// 학부모 — 결제 요청 수락 + 결제 화면. 두 진입 모드를 하나의 라우트에서 갈라 받는다
// (?order=<id> 유무). 학생이 fn_request_enrollment 로 만든 요청(StudentEnrollmentRequest.jsx
// 참고)을 학부모가 여기서 수락(fn_respond_enrollment)하고, 반환된 서버 확정 금액으로만
// 토스 결제창을 연다 — 표시가는 항상 미리보기일 뿐이다(핸들러 주석 참고).
//
// ※ 이 화면은 카트를 갖지 않는다 — 예전 /checkout(Checkout.jsx)의 "학부모가 직접
//   장바구니를 담아 결제"하는 경로는 여기서 만들지 않는다(제품 규칙 확정 — 학생이
//   요청하고 학부모가 수락+결제한다, StudentEnrollmentRequest.jsx:13-21 주석과 짝).
//   ?order= 없이 들어오면 그 사실 자체를 안내하는 모달만 보여주고 마이페이지로 보낸다.

const PAY_METHODS = [
  { key: 'tosspay', label: '토스페이', tossMethod: 'CARD' },
  { key: 'card', label: '신용/체크카드', tossMethod: 'CARD' },
  { key: 'virtual', label: '가상계좌', tossMethod: 'VIRTUAL_ACCOUNT' }
];

const SECTION_HEADING =
  'text-[1.25rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[2rem] sm:leading-[1.4]';

// Checkout.jsx(src/pages/Checkout.jsx) 의 쿠폰 사유 문구·코드 미발견 문구를 그대로
// 재사용한다 — 같은 fn_usable_coupons/fn_coupon_by_code 반환 형태를 쓰는 화면이라
// 사유 코드 7종·안내 문구가 동일하다(코퍼스 재사용, 신규 문구 아님).
const COUPON_REASON_TEXT = {
  below_min_amount: '최소 결제 금액에 미치지 않습니다.',
  expired: '사용 기한이 지났습니다.',
  already_used: '이미 사용한 쿠폰입니다.',
  inactive: '사용할 수 없는 쿠폰입니다.',
  login_required: '로그인 후 사용할 수 있습니다.',
  sold_out: '발급 수량이 모두 소진되었습니다.',
  not_granted: '발급받지 않은 쿠폰입니다.'
};
const CODE_NOT_FOUND_TEXT = '유효하지 않은 쿠폰 코드입니다.';
// Checkout.jsx:184 와 동일 문구(표시가/서버 청구가 불일치 안내) — fn_respond_enrollment 가
// skipped_coupon_ids 를 돌려줄 때도 같은 상황(서버가 쿠폰 일부를 조용히 스킵)이라
// 그대로 재사용한다.
const AMOUNT_MISMATCH_TEXT = '결제 금액이 변경되었습니다. 쿠폰 적용 내용을 다시 확인해 주세요.';

// 신규 문구(이 화면 전용, 사용자 승인 대기) — new_copy 배열 참고.
const LOAD_FAILED_TEXT = '결제 요청 정보를 불러오지 못했습니다.';
const ALREADY_PROCESSED_TEXT = '이미 처리된 결제 요청입니다.';
const NOT_PARENT_TEXT = '학부모 본인만 진행할 수 있는 결제 요청이에요.';
// 고정 계약 상수 목록의 승인된 재사용 문구 — 신규 아님.
const GENERIC_FAIL_TEXT = '결제요청에 실패했습니다.';

// fn_usable_coupons/fn_coupon_by_code 공통 반환 형태(owner_profile_id/owner_is_student
// 포함 — dev pg_proc 실측). code 는 P1-1 하드닝 이후 반환되지 않는다(Checkout.jsx:149 주석과 동일).
function mapCouponRow(c) {
  return {
    id: c.id,
    title: c.title,
    discount: c.discount_amount,
    minAmount: c.min_amount || 0,
    validUntil: c.valid_until,
    isActive: c.is_active,
    eligible: c.eligible,
    reason: c.reason,
    ownerIsStudent: c.owner_is_student
  };
}

// fn_respond_enrollment 가 raise 하는 문구 키워드로 매핑한다 — SQLSTATE(WCxxx)는
// 보조로만 쓰고 원문(err.message)을 화면에 그대로 노출하지 않는다.
function mapRespondError(err) {
  const msg = err?.message || '';
  if (msg.includes('not_order_parent')) return NOT_PARENT_TEXT;
  if (msg.includes('order_not_pending') || msg.includes('enrollment_not_pending')) {
    return ALREADY_PROCESSED_TEXT;
  }
  if (msg.includes('order_not_found')) return LOAD_FAILED_TEXT;
  return GENERIC_FAIL_TEXT;
}

// ?order= 없는 진입 — 카트 결제 경로 자체가 없으므로 안내 후 마이페이지로 보낸다.
// 문구는 고정 계약이 지정한 기존 승인 문구를 그대로 쓴다(신규 아님).
function ApprovalOnlyGate() {
  const navigate = useNavigate();
  const goToMyPage = () => navigate('/mypage', { replace: true });

  return (
    <main className="min-h-screen bg-white pt-16">
      <ConfirmModal
        title="학생이 요청한 결제만 진행할 수 있어요"
        onConfirm={goToMyPage}
        onClose={goToMyPage}
      >
        학생이 결제를 요청하면 마이페이지에서 진행할 수 있어요.
      </ConfirmModal>
    </main>
  );
}

// 요청을 불러오지 못했거나(RLS/네트워크/삭제) 더 이상 진행할 수 없는 상태(이미
// 승인·반려됐거나 주문이 pending 이 아님)일 때 공통으로 쓰는 안내 화면.
function OrderNotActionable({ text }) {
  const navigate = useNavigate();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white pt-16 text-center">
      <p className="text-[1rem] font-semibold leading-[1.4] text-ink sm:text-[1.25rem]">{text}</p>
      <button
        type="button"
        onClick={() => navigate('/mypage')}
        className="mt-8 rounded-xl bg-primary px-8 py-3.5 text-[0.875rem] font-semibold leading-[1.25rem] text-white transition hover:brightness-125"
      >
        마이페이지로 이동
      </button>
    </main>
  );
}

// ?order=<id> 진입 — 수락 + 결제 본문.
function EnrollmentCheckout({ orderId }) {
  const [order, setOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  // 'not_found' | 'not_actionable' — 어느 쪽이든 화면은 OrderNotActionable 로 수렴한다.
  const [orderError, setOrderError] = useState(null);
  const [orderLoading, setOrderLoading] = useState(true);

  const [coupons, setCoupons] = useState([]);
  const [couponError, setCouponError] = useState(false);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const [selectedCouponIds, setSelectedCouponIds] = useState(() => new Set());
  const [couponCode, setCouponCode] = useState('');
  const [codeFeedback, setCodeFeedback] = useState(null);
  const [amountMismatch, setAmountMismatch] = useState(false);

  const [payMethod, setPayMethod] = useState('card');
  const [loading, setLoading] = useState(false);
  const [payError, setPayError] = useState(null);
  // fn_respond_enrollment 성공 응답을 캐시한다 — 승인은 즉시 서버에서 확정되므로
  // (approval_status='approved', 쿠폰 귀속 insert 까지 끝남) 이후 토스 결제창만
  // 실패/재시도해도 RPC 를 다시 부르지 않는다(재호출 시 enrollment_not_pending 로 죽는다).
  const [approvedOrder, setApprovedOrder] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setOrderLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, status, approval_status, order_name, list_amount, discount_amount, amount, student_profile_id'
        )
        .eq('id', orderId)
        .maybeSingle();
      if (!alive) return;

      if (error || !data) {
        if (error) console.warn('결제 요청 조회 실패:', error.message);
        setOrderError('not_found');
        setOrderLoading(false);
        return;
      }

      // 진입 게이트 — 결제 전(status='pending') 주문만 받는다. 승인축은 두 값을
      // 모두 통과시킨다.
      //   requested = 아직 수락 전. 수락 + 쿠폰 선택 + 결제를 여기서 다 한다.
      //   approved  = 수락(fn_respond_enrollment)까지 끝났는데 토스 결제창만 닫힌
      //               상태 → **재개 모드**. 2026-08-13 이전에는 이 값이 게이트에
      //               걸려 not_actionable 로 막혔고, 그래서 학부모가 수락 후
      //               결제창을 닫으면 그 주문을 되살릴 방법이 아예 없었다
      //               (docs/mypage-payment-handoff.md 작업 2).
      if (data.status !== 'pending' || !['requested', 'approved'].includes(data.approval_status)) {
        setOrder(data);
        setOrderError('not_actionable');
        setOrderLoading(false);
        return;
      }

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('id, name, list_price, price, quantity')
        .eq('order_id', orderId);
      if (!alive) return;

      if (itemsError) {
        console.warn('주문 상품 조회 실패:', itemsError.message);
        setOrderError('not_found');
        setOrderLoading(false);
        return;
      }

      // 재개 모드 — 수락이 이미 끝났으므로 fn_respond_enrollment 를 다시 부르면
      // 안 된다(재호출은 enrollment_not_pending 으로 죽는다, 위 approvedOrder 주석).
      // handlePay 가 그 RPC 를 건너뛰고 곧장 토스를 부르도록, 승인 결과와 같은
      // 모양을 DB 행에서 만들어 미리 채운다. 금액은 쿠폰 귀속까지 반영된 확정값
      // (orders.amount)이라 여기서 다시 계산하지 않는다.
      if (data.approval_status === 'approved') {
        setApprovedOrder({ order_id: data.id, amount: data.amount });
      }

      setOrder(data);
      setOrderItems(items || []);
      setOrderError(null);
      setOrderLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [orderId]);

  // 쿠폰 목록 — subtotal 은 요청 시점 amount(쿠폰 미적용, Baseline fn_respond_enrollment
  // 주석 "v_subtotal := v_order.amount"). p_student_profile_id 를 반드시 넘겨야
  // granted 쿠폰(학생/학부모 발급분)이 잡힌다(Baseline pg_proc 실측 인자).
  const fetchCoupons = useCallback(
    async ({ signalAlive } = {}) => {
      if (!order) return;
      const { data, error } = await supabase.rpc('fn_usable_coupons', {
        p_subtotal: order.amount,
        p_student_profile_id: order.student_profile_id
      });
      if (signalAlive && !signalAlive()) return;
      setCouponsLoaded(true);
      if (error) {
        console.warn('쿠폰 조회 실패:', error.message);
        setCouponError(true);
        return;
      }
      setCouponError(false);
      setCoupons((data || []).map(mapCouponRow));
    },
    [order]
  );

  // 재개 모드(수락 완료 + 결제만 남음). 쿠폰은 수락 시점에 이미 귀속됐고
  // orders.amount 가 그 결과라, 다시 고르게 하면 화면 금액과 실제 청구액이
  // 갈라진다 — 조회도 하지 않고 UI 도 감춘다.
  const isResume = order?.approval_status === 'approved';

  useEffect(() => {
    if (!order || isResume) return undefined;
    let alive = true;
    fetchCoupons({ signalAlive: () => alive });
    return () => {
      alive = false;
    };
  }, [order, isResume, fetchCoupons]);

  const visibleCoupons = useMemo(() => coupons.filter((c) => c.isActive), [coupons]);

  const couponDiscount = useMemo(() => {
    if (!order) return 0;
    let sum = 0;
    coupons.forEach((c) => {
      if (selectedCouponIds.has(c.id) && c.eligible) sum += Number(c.discount || 0);
    });
    return Math.min(sum, order.amount);
  }, [coupons, selectedCouponIds, order]);

  // 표시가는 항상 미리보기다 — 실제 청구액은 fn_respond_enrollment 반환값(승인 이후엔
  // approvedOrder.amount)을 쓴다.
  const previewAmount = order ? Math.max(0, order.amount - couponDiscount) : 0;
  const displayAmount = approvedOrder ? approvedOrder.amount : previewAmount;

  function toggleCoupon(id) {
    setAmountMismatch(false);
    setSelectedCouponIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyCouponCode() {
    if (!order) return;
    const code = couponCode.trim();
    if (!code) return;

    const { data, error } = await supabase.rpc('fn_coupon_by_code', {
      p_code: code,
      p_subtotal: order.amount,
      p_student_profile_id: order.student_profile_id
    });
    if (error) {
      console.warn('쿠폰 코드 조회 실패:', error.message);
      setCouponError(true);
      return;
    }

    const found = data?.[0];
    if (!found) {
      setCodeFeedback({ type: 'not_found' });
      return;
    }

    setCoupons((prev) => [...prev.filter((c) => c.id !== found.id), mapCouponRow(found)]);
    setSelectedCouponIds((prev) => new Set(prev).add(found.id));
    setAmountMismatch(false);
    setCodeFeedback(found.eligible ? null : { type: 'ineligible', reason: found.reason });
    setCouponCode('');
  }

  const canPay = Boolean(order) && !orderError && orderItems.length > 0 && !loading;

  async function handlePay() {
    if (!canPay) return;
    setLoading(true);
    setPayError(null);
    try {
      let result = approvedOrder;

      if (!result) {
        // 클라이언트 rpc(학부모 JWT) — service_role 경유 금지(Baseline fn_respond_enrollment
        // 는 auth.uid() = parent_profile_id 를 직접 검사한다).
        const { data, error } = await supabase.rpc('fn_respond_enrollment', {
          p_order_id: orderId,
          p_approve: true,
          p_reject_reason: null,
          p_coupon_ids: Array.from(selectedCouponIds)
        });
        if (error) {
          console.error('결제 요청 수락 실패:', error.message);
          setPayError(mapRespondError(error));
          setLoading(false);
          return;
        }

        result = Array.isArray(data) ? data[0] : data;
        if (!result?.amount) {
          setPayError(GENERIC_FAIL_TEXT);
          setLoading(false);
          return;
        }
        setApprovedOrder(result);

        if ((result.skipped_coupon_ids || []).length > 0) {
          setAmountMismatch(true);
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session ?? null;
      const user = session?.user ?? null;

      const method = PAY_METHODS.find((m) => m.key === payMethod)?.tossMethod || 'CARD';
      const tossPayments = await getTossPayments();
      const payment = tossPayments.payment({ customerKey: user?.id ?? ANONYMOUS });

      await payment.requestPayment({
        method,
        amount: { currency: 'KRW', value: Number(result.amount) },
        orderId: result.order_id || orderId,
        orderName: order.order_name || '위닝에듀 서비스',
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerEmail: user?.email ?? undefined,
        ...(method === 'CARD'
          ? {
              card: {
                useEscrow: false,
                flowMode: 'DEFAULT',
                useCardPoint: false,
                useAppCardOnly: false
              }
            }
          : {}),
        ...(method === 'VIRTUAL_ACCOUNT'
          ? { virtualAccount: { cashReceipt: { type: '소득공제' }, validHours: 24 } }
          : {})
      });
    } catch (err) {
      if (err?.code !== 'USER_CANCEL') {
        console.error('결제 요청 실패:', err);
        setPayError(GENERIC_FAIL_TEXT);
      }
      setLoading(false);
    }
  }

  if (orderLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-[0.875rem] font-medium text-ink-sub">
          결제 요청 정보를 불러오는 중입니다.
        </p>
      </main>
    );
  }

  if (orderError === 'not_found') {
    return <OrderNotActionable text={LOAD_FAILED_TEXT} />;
  }
  if (orderError === 'not_actionable') {
    return <OrderNotActionable text={ALREADY_PROCESSED_TEXT} />;
  }

  return (
    <main className="min-h-screen bg-white pt-16">
      {/* 콘텐츠 폭 규약 — Checkout.jsx:517-529 주석과 동일한 전역 관용구
          (mx-auto w-full max-w-content px-5 sm:px-8). */}
      <div className="mx-auto w-full max-w-content px-5 py-14 sm:px-8">
        <h1 className="mb-12 text-[2rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink sm:text-[3.125rem]">
          결제하기
        </h1>

        <div className="grid grid-cols-1 gap-12 desktop:grid-cols-[minmax(0,1fr)_25rem]">
          {/* 좌측: 주문 상품 — 읽기 전용(학생이 이미 확정한 요청이라 항목 선택/삭제가 없다). */}
          <section>
            <h2 className={`mb-5 ${SECTION_HEADING}`}>주문 상품 {orderItems.length}</h2>
            <div className="space-y-3">
              {orderItems.map((item) => {
                const hasDiscount = Number(item.list_price) > Number(item.price);
                return (
                  <div key={item.id} className="rounded-2xl border border-line p-5">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-[0.875rem] font-medium leading-[1.3] tracking-[-0.02em] text-ink sm:text-[1.5rem]">
                        {item.name}
                      </p>
                      <div className="flex shrink-0 flex-col items-end">
                        {hasDiscount && (
                          <span className="text-[0.75rem] font-medium leading-[1.25rem] tracking-[-0.02em] text-line line-through sm:text-[1.25rem] sm:font-normal sm:leading-[1.75rem]">
                            {formatKRW(item.list_price)}
                          </span>
                        )}
                        <span className="text-[0.8125rem] font-medium leading-[1.25rem] tracking-[-0.02em] text-ink sm:text-[1.25rem] sm:leading-[1.75rem]">
                          {formatKRW(item.price)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 우측: 결제수단/쿠폰/금액 — Checkout.jsx 아래쪽 aside 와 같은 골격. */}
          <aside className="mx-auto w-full max-w-[35.625rem] space-y-10">
            <div>
              <h3 className={`mb-4 ${SECTION_HEADING}`}>결제 수단 선택</h3>
              <div className="mx-auto grid max-w-[10rem] grid-cols-1 gap-2 sm:max-w-none sm:grid-cols-3">
                {PAY_METHODS.map((m) => (
                  <button
                    type="button"
                    key={m.key}
                    onClick={() => setPayMethod(m.key)}
                    className={`h-11 rounded-lg border text-[0.875rem] font-medium leading-[1.25rem] transition ${
                      payMethod === m.key
                        ? 'border-primary bg-surface-info text-primary'
                        : 'border-line text-ink-sub hover:bg-surface-card'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 쿠폰 선택 — 재개 모드에서는 감춘다(위 isResume 주석). */}
            {!isResume && (
            <div>
              <h3 className={`mb-4 ${SECTION_HEADING}`}>쿠폰 선택</h3>
              <div className="flex gap-2">
                <input
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value);
                    setCodeFeedback(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && applyCouponCode()}
                  placeholder="쿠폰 코드 입력"
                  className="h-11 flex-1 rounded-lg border border-line px-3.5 text-[0.875rem] font-medium leading-[1.25rem] text-ink placeholder:font-medium placeholder:text-line focus:border-primary"
                />
                <button
                  type="button"
                  onClick={applyCouponCode}
                  className="h-11 shrink-0 rounded-lg border border-line px-5 text-[0.875rem] font-medium leading-[1.25rem] text-ink transition hover:bg-surface-card"
                >
                  적용
                </button>
              </div>

              {couponError && (
                <p className="mt-3 text-[0.75rem] font-medium leading-[1.4] text-error">
                  쿠폰을 불러오지 못했습니다.
                </p>
              )}

              {codeFeedback?.type === 'not_found' && (
                <p className="mt-3 text-[0.75rem] font-medium leading-[1.4] text-error">
                  {CODE_NOT_FOUND_TEXT}
                </p>
              )}
              {codeFeedback?.type === 'ineligible' && COUPON_REASON_TEXT[codeFeedback.reason] && (
                <p className="mt-3 text-[0.75rem] font-medium leading-[1.4] text-error">
                  {COUPON_REASON_TEXT[codeFeedback.reason]}
                </p>
              )}

              {couponsLoaded && !couponError && visibleCoupons.length === 0 && (
                <p className="mt-5 text-[0.875rem] font-normal leading-[1.25rem] text-ink-sub">
                  보유한 쿠폰이 없습니다.
                </p>
              )}

              {visibleCoupons.length > 0 && (
                <>
                  <p className="mb-2 mt-5 text-[0.875rem] font-normal leading-[1.25rem] text-ink">
                    보유 쿠폰 {visibleCoupons.length}장
                  </p>
                  <div className="space-y-2">
                    {visibleCoupons.map((c) => {
                      const eligible = c.eligible;
                      const isSelected = selectedCouponIds.has(c.id);
                      // 소유자 구분(신규) — fn_usable_coupons/fn_coupon_by_code 가 돌려주는
                      // owner_is_student 를 그대로 라벨링한다. auto 발급(둘 다 아님)은 null.
                      const ownerLabel =
                        c.ownerIsStudent === true
                          ? '학생 쿠폰'
                          : c.ownerIsStudent === false
                            ? '학부모 쿠폰'
                            : null;
                      return (
                        <button
                          type="button"
                          key={c.id}
                          disabled={!eligible}
                          onClick={() => toggleCoupon(c.id)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                            isSelected ? 'border-primary bg-surface-info' : 'border-line'
                          } ${eligible ? '' : 'opacity-45'}`}
                        >
                          <span
                            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${
                              isSelected ? 'border-primary bg-primary' : 'border-line bg-white'
                            }`}
                          >
                            {isSelected && <Check size={12} strokeWidth={3.5} className="text-white" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="block truncate text-[0.75rem] font-medium leading-[1.25rem] text-ink sm:text-[0.875rem]">
                                {c.title}
                              </span>
                              {ownerLabel && (
                                <span className="shrink-0 rounded-full bg-surface-card px-1.5 py-0.5 text-[0.625rem] font-medium leading-[1] text-ink-sub">
                                  {ownerLabel}
                                </span>
                              )}
                            </span>
                            {c.validUntil && (
                              <span className="block text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
                                {String(c.validUntil).replace(/-/g, '.')}까지
                              </span>
                            )}
                            {!eligible && COUPON_REASON_TEXT[c.reason] && (
                              <span className="block text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
                                {COUPON_REASON_TEXT[c.reason]}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[0.75rem] font-medium leading-[1.25rem] text-primary sm:text-[0.875rem]">
                            -{formatKRW(c.discount)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setAmountMismatch(false);
                        setSelectedCouponIds(new Set());
                      }}
                      className="text-[0.875rem] font-normal leading-[1.25rem] text-ink underline underline-offset-4 transition hover:brightness-90"
                    >
                      쿠폰 사용 안함
                    </button>
                  </div>
                </>
              )}
            </div>
            )}

            {isResume && (
              // ⚠ 신규 카피 — 승인 필요. 쿠폰 섹션이 사라진 이유를 설명하지 않으면
              // 학부모는 "쿠폰을 못 쓰게 됐다"로 읽는다.
              <p className="rounded-xl bg-surface-04 px-4 py-3 text-[0.875rem] leading-relaxed text-ink-sub">
                이미 수락한 요청이에요. 적용한 쿠폰과 결제 금액은 그대로이고, 결제만 진행하면 됩니다.
              </p>
            )}

            <div>
              <h3 className={`mb-4 ${SECTION_HEADING}`}>결제 금액</h3>
              <dl className="space-y-3 text-[0.875rem] font-medium leading-[1.25rem] text-ink">
                <div className="flex justify-between">
                  <dt>판매가</dt>
                  <dd>{formatKRW(order.list_amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>할인 금액</dt>
                  <dd className="text-primary">
                    {order.discount_amount > 0
                      ? `-${formatKRW(order.discount_amount)}`
                      : formatKRW(0)}
                  </dd>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between">
                    <dt>쿠폰 할인 금액</dt>
                    <dd className="text-primary">-{formatKRW(couponDiscount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-3 text-[1rem] font-semibold leading-[1.4] sm:text-[1.25rem] sm:leading-[1.75rem]">
                  <dt>총 결제 금액</dt>
                  <dd>{formatKRW(displayAmount)}</dd>
                </div>
              </dl>

              {amountMismatch && (
                <p aria-live="polite" className="mt-4 text-[0.75rem] font-medium leading-[1.4] text-error">
                  {AMOUNT_MISMATCH_TEXT}
                </p>
              )}

              {payError && (
                <p aria-live="polite" className="mt-4 text-[0.75rem] font-medium leading-[1.4] text-error">
                  {payError}
                </p>
              )}

              <button
                type="button"
                onClick={handlePay}
                disabled={!canPay}
                className={`mt-6 w-full rounded-xl py-4 text-[0.875rem] font-semibold leading-[1.25rem] transition sm:text-[1.25rem] sm:leading-[1.75rem] ${
                  canPay
                    ? 'bg-primary text-white hover:brightness-125'
                    : 'cursor-not-allowed border border-line bg-surface-card text-ink'
                }`}
              >
                {loading ? '결제창 여는 중…' : `${formatKRW(displayAmount)} 결제하기`}
              </button>
              <p className="mt-3 text-center text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
                결제는 토스페이먼츠를 통해 안전하게 처리됩니다.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function ParentCheckout() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order');

  if (!orderId) return <ApprovalOnlyGate />;
  return <EnrollmentCheckout orderId={orderId} />;
}
