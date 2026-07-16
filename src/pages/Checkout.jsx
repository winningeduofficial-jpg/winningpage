import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';
import { supabase } from '../lib/supabase';
import { getTossPayments, ANONYMOUS } from '../lib/toss';
import { COUPONS, formatKRW } from '../data/pricingCatalog';
import { CHECKOUT_AGREEMENTS } from '../data/legalDocs';
import { getCart, saveCart } from '../lib/cart';

const PAY_METHODS = [
  { key: 'tosspay', label: '토스페이', tossMethod: 'CARD' }, // 간편결제는 카드창 내에서 제공
  { key: 'card', label: '신용 / 체크카드', tossMethod: 'CARD' },
  { key: 'virtual', label: '가상계좌', tossMethod: 'VIRTUAL_ACCOUNT' },
];

function Accordion({ title, open, onToggle, children }) {
  return (
    <div className="rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[14px] font-bold text-[#0D1B2A]"
      >
        <span>{title}</span>
        <ChevronDown size={18} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-slate-100 px-4 py-3.5">{children}</div>}
    </div>
  );
}

// 약관 전문 (스크롤 영역). 제N조 / [소제목] / <소제목> / 번호 목차는 굵게.
function AgreementText({ text }) {
  const lines = text.split('\n');
  return (
    <div className="max-h-[240px] overflow-y-auto pr-1.5 text-[12px] leading-relaxed text-slate-500">
      {lines.map((line, i) => {
        const t = line.trim();
        if (t === '') return <div key={i} className="h-2" />;
        const heading =
          /^제\d+조/.test(t) || /^\[.*\]$/.test(t) || /^<.*>$/.test(t) || /^부칙/.test(t) || /^\d+\.\s/.test(t);
        if (heading) {
          return (
            <p key={i} className="mt-2.5 font-bold text-[#0D1B2A]">
              {t}
            </p>
          );
        }
        return (
          <p key={i} className="break-keep">
            {t}
          </p>
        );
      })}
    </div>
  );
}

function RequiredCheck({ checked, onChange, children }) {
  return (
    <button type="button" onClick={onChange} className="mt-2.5 flex items-center gap-2 text-left">
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${
          checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
        }`}
      >
        {checked && <Check size={12} strokeWidth={3.5} className="text-white" />}
      </span>
      <span className="text-[12.5px] text-slate-500">
        <span className="mr-1 font-bold text-blue-600">필수</span>
        {children}
      </span>
    </button>
  );
}

export default function Checkout() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => getCart());
  const [checkedIds, setCheckedIds] = useState(() => new Set(getCart().map((i) => i.id)));

  const [coupons, setCoupons] = useState(COUPONS);
  const [selectedCouponIds, setSelectedCouponIds] = useState(() => new Set());
  const [couponCode, setCouponCode] = useState('');

  const [payMethod, setPayMethod] = useState('card');
  const [openNotice, setOpenNotice] = useState(false);
  const [openTerms, setOpenTerms] = useState(false);
  const [agreeNotice, setAgreeNotice] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  // 쿠폰 목록 로드 (실패 시 폴백 유지)
  useEffect(() => {
    let alive = true;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('coupons')
        .select('id, code, title, discount_amount, min_amount, valid_until, is_active')
        .eq('is_active', true)
        .gte('valid_until', today)
        .order('discount_amount', { ascending: false });
      if (!alive || error || !data) return;
      setCoupons(
        data.map((c) => ({
          id: c.id,
          code: c.code,
          title: c.title,
          discount: c.discount_amount,
          minAmount: c.min_amount || 0,
          validUntil: c.valid_until,
        }))
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const checkedItems = useMemo(() => items.filter((i) => checkedIds.has(i.id)), [items, checkedIds]);
  const allChecked = items.length > 0 && checkedIds.size === items.length;

  // 금액 계산
  const listTotal = checkedItems.reduce((s, i) => s + Number(i.listPrice || i.price || 0), 0);
  const subtotal = checkedItems.reduce((s, i) => s + Number(i.price || 0), 0);
  const productDiscount = listTotal - subtotal;

  // 선택된 쿠폰 중 조건 충족분만 적용, 총 할인은 subtotal 초과 불가
  const couponDiscount = useMemo(() => {
    let sum = 0;
    coupons.forEach((c) => {
      if (selectedCouponIds.has(c.id) && subtotal >= (c.minAmount || 0)) sum += Number(c.discount || 0);
    });
    return Math.min(sum, subtotal);
  }, [coupons, selectedCouponIds, subtotal]);

  const discountTotal = productDiscount + couponDiscount;
  const payAmount = Math.max(0, listTotal - discountTotal);

  const canPay = checkedItems.length > 0 && agreeNotice && agreeTerms && !loading;

  function toggleAll() {
    setCheckedIds(allChecked ? new Set() : new Set(items.map((i) => i.id)));
  }

  function toggleItem(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function removeChecked() {
    const remaining = items.filter((i) => !checkedIds.has(i.id));
    setItems(remaining);
    setCheckedIds(new Set(remaining.map((i) => i.id)));
    saveCart(remaining);
  }

  function toggleCoupon(id) {
    setSelectedCouponIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyCouponCode() {
    const code = couponCode.trim().toLowerCase();
    if (!code) return;
    const found = coupons.find((c) => (c.code || '').toLowerCase() === code);
    if (!found) {
      window.alert('유효하지 않은 쿠폰 코드입니다.');
      return;
    }
    setSelectedCouponIds((prev) => new Set(prev).add(found.id));
    setCouponCode('');
  }

  async function handlePay() {
    if (!canPay) return;
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session ?? null;
      const user = session?.user ?? null;

      // 서버가 DB 가격으로 금액을 재계산해 주문(pending)을 생성한다. (금액 위변조 방지)
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          items: checkedItems.map((i) => ({ id: i.id })),
          couponIds: Array.from(selectedCouponIds),
        }),
      });

      let order = {};
      try {
        order = await res.json();
      } catch {
        order = {};
      }

      if (!res.ok || !order?.orderId || !order?.amount) {
        window.alert(order?.error || '주문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
        setLoading(false);
        return;
      }

      const method = PAY_METHODS.find((m) => m.key === payMethod)?.tossMethod || 'CARD';
      const tossPayments = await getTossPayments();
      const payment = tossPayments.payment({ customerKey: user?.id ?? ANONYMOUS });

      await payment.requestPayment({
        method,
        amount: { currency: 'KRW', value: Number(order.amount) },
        orderId: order.orderId,
        orderName: order.orderName || '위닝에듀 서비스',
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerEmail: user?.email ?? undefined,
        ...(method === 'CARD'
          ? { card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false } }
          : {}),
        ...(method === 'VIRTUAL_ACCOUNT'
          ? { virtualAccount: { cashReceipt: { type: '소득공제' }, validHours: 24 } }
          : {}),
      });
    } catch (err) {
      // 결제창을 닫으면 USER_CANCEL 로 들어온다.
      if (err?.code !== 'USER_CANCEL') {
        console.error('결제 요청 실패:', err);
        window.alert(`결제를 시작하지 못했습니다: ${err?.message ?? err}`);
      }
      setLoading(false);
    }
  }

  // 빈 장바구니
  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="flex min-h-screen flex-col items-center justify-center bg-white pt-[84px] text-center">
          <h1 className="text-2xl font-black text-[#0D1B2A]">선택한 상품이 없습니다</h1>
          <p className="mt-3 text-slate-500">결제할 서비스를 먼저 선택해주세요.</p>
          <Link
            to="/pricing"
            className="mt-8 rounded-xl bg-[#0D1B2A] px-8 py-3.5 text-sm font-black text-white transition hover:bg-[#162A40]"
          >
            서비스 선택하러 가기
          </Link>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white pt-[84px]">
        <div className="mx-auto max-w-[1180px] px-6 py-14">
          <h1 className="mb-12 text-[38px] font-black tracking-[-0.02em] text-[#0D1B2A]">결제하기</h1>

          <div className="grid gap-12 lg:grid-cols-[1fr_400px]">
            {/* 좌측: 주문 상품 */}
            <section>
              <h2 className="mb-5 text-[22px] font-black text-[#0D1B2A]">주문 상품 {items.length}</h2>

              <button type="button" onClick={toggleAll} className="mb-4 flex items-center gap-2">
                <span
                  className={`flex h-[20px] w-[20px] items-center justify-center rounded-[6px] border transition ${
                    allChecked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                  }`}
                >
                  {allChecked && <Check size={13} strokeWidth={3.5} className="text-white" />}
                </span>
                <span className="text-[14px] font-bold text-[#0D1B2A]">전체 선택</span>
              </button>

              <div className="space-y-3">
                {items.map((item) => {
                  const isChecked = checkedIds.has(item.id);
                  const hasDiscount = Number(item.listPrice) > Number(item.price);
                  return (
                    <div key={item.id} className="flex gap-3 rounded-2xl border border-slate-200 p-5">
                      <button type="button" onClick={() => toggleItem(item.id)} className="mt-0.5 shrink-0">
                        <span
                          className={`flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border transition ${
                            isChecked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check size={14} strokeWidth={3.5} className="text-white" />}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-[15px] font-bold text-[#0D1B2A]">{item.name}</p>
                          <div className="flex shrink-0 flex-col items-end leading-tight">
                            {hasDiscount && (
                              <span className="text-[12px] text-slate-400 line-through">{formatKRW(item.listPrice)}</span>
                            )}
                            <span className="flex items-center gap-2">
                              {item.badge && <span className="text-[13px] font-bold text-blue-600">{item.badge}</span>}
                              <span className="text-[15px] font-black text-[#0D1B2A]">{formatKRW(item.price)}</span>
                            </span>
                          </div>
                        </div>
                        {item.serviceDesc && (
                          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">{item.serviceDesc}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {checkedIds.size > 0 && (
                <button
                  type="button"
                  onClick={removeChecked}
                  className="mt-4 text-[13px] font-bold text-slate-400 underline underline-offset-4 transition hover:text-slate-600"
                >
                  선택 삭제
                </button>
              )}
            </section>

            {/* 우측: 확인/쿠폰/결제수단/금액 */}
            <aside className="space-y-10">
              {/* 구매 전 확인사항 */}
              <div>
                <h3 className="mb-4 text-[20px] font-black text-[#0D1B2A]">구매 전 확인사항</h3>
                <Accordion title="[구매 전 안내사항]" open={openNotice} onToggle={() => setOpenNotice((v) => !v)}>
                  <AgreementText text={CHECKOUT_AGREEMENTS.purchaseNotice} />
                </Accordion>
                <RequiredCheck checked={agreeNotice} onChange={() => setAgreeNotice((v) => !v)}>
                  위 내용을 모두 확인하였습니다.
                </RequiredCheck>
              </div>

              {/* 쿠폰 선택 */}
              <div>
                <h3 className="mb-4 text-[20px] font-black text-[#0D1B2A]">쿠폰 선택</h3>
                <div className="flex gap-2">
                  <input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyCouponCode()}
                    placeholder="쿠폰 코드 입력"
                    className="h-11 flex-1 rounded-lg border border-slate-200 px-3.5 text-[13px] text-[#0D1B2A] placeholder:text-slate-400 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={applyCouponCode}
                    className="h-11 shrink-0 rounded-lg border border-slate-300 px-5 text-[13px] font-bold text-[#0D1B2A] transition hover:bg-slate-50"
                  >
                    적용
                  </button>
                </div>

                {coupons.length > 0 && (
                  <>
                    <p className="mb-2 mt-5 text-[13px] font-bold text-slate-500">보유 쿠폰 {coupons.length}장</p>
                    <div className="space-y-2">
                      {coupons.map((c) => {
                        const eligible = subtotal >= (c.minAmount || 0);
                        const isSelected = selectedCouponIds.has(c.id);
                        return (
                          <button
                            type="button"
                            key={c.id}
                            disabled={!eligible}
                            onClick={() => toggleCoupon(c.id)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                              isSelected ? 'border-blue-500 bg-blue-50/40' : 'border-slate-200'
                            } ${eligible ? '' : 'opacity-45'}`}
                          >
                            <span
                              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${
                                isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check size={12} strokeWidth={3.5} className="text-white" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-bold text-[#0D1B2A]">{c.title}</span>
                              {c.validUntil && (
                                <span className="block text-[11.5px] text-slate-400">
                                  {String(c.validUntil).replace(/-/g, '.')}까지
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-[13.5px] font-black text-[#0D1B2A]">
                              -{Number(c.discount).toLocaleString('ko-KR')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedCouponIds(new Set())}
                        className="text-[12.5px] font-bold text-slate-400 underline underline-offset-4 hover:text-slate-600"
                      >
                        쿠폰 사용 안함
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 결제 수단 선택 */}
              <div>
                <h3 className="mb-4 text-[20px] font-black text-[#0D1B2A]">결제 수단 선택</h3>
                <div className="grid grid-cols-3 gap-2">
                  {PAY_METHODS.map((m) => (
                    <button
                      type="button"
                      key={m.key}
                      onClick={() => setPayMethod(m.key)}
                      className={`h-11 rounded-lg border text-[13px] font-bold transition ${
                        payMethod === m.key
                          ? 'border-blue-600 bg-blue-50/50 text-blue-600'
                          : 'border-slate-200 text-[#0D1B2A] hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  <Accordion
                    title="결제 서비스 이용 및 개인정보 처리 약관"
                    open={openTerms}
                    onToggle={() => setOpenTerms((v) => !v)}
                  >
                    <AgreementText text={CHECKOUT_AGREEMENTS.paymentAgreement} />
                  </Accordion>
                  <RequiredCheck checked={agreeTerms} onChange={() => setAgreeTerms((v) => !v)}>
                    위 내용을 모두 확인하였습니다.
                  </RequiredCheck>
                </div>
              </div>

              {/* 결제 금액 */}
              <div>
                <h3 className="mb-4 text-[20px] font-black text-[#0D1B2A]">결제 금액</h3>
                <dl className="space-y-3 text-[14px]">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">판매가</dt>
                    <dd className="font-bold text-[#0D1B2A]">{formatKRW(listTotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">할인가</dt>
                    <dd className="font-bold text-blue-600">
                      {discountTotal > 0 ? `-${formatKRW(discountTotal)}` : formatKRW(0)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-3">
                    <dt className="text-[15px] font-black text-[#0D1B2A]">총 결제 금액</dt>
                    <dd className="text-[18px] font-black text-[#0D1B2A]">{formatKRW(payAmount)}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={handlePay}
                  disabled={!canPay}
                  className={`mt-6 w-full rounded-xl py-4 text-[15px] font-black transition ${
                    canPay
                      ? 'bg-[#0D1B2A] text-white hover:bg-[#162A40]'
                      : 'cursor-not-allowed bg-slate-200 text-slate-400'
                  }`}
                >
                  {loading ? '결제창 여는 중…' : `${formatKRW(payAmount)} 결제하기`}
                </button>
                <p className="mt-3 text-center text-[11px] text-slate-400">
                  결제는 토스페이먼츠를 통해 안전하게 처리됩니다.
                </p>
              </div>
            </aside>
          </div>
        </div>

        <SiteFooter />
      </main>
    </>
  );
}
