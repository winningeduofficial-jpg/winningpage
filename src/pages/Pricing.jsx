import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTossPayments, ANONYMOUS, createOrderId } from '../lib/toss';

// 데모용 요금제. 실제로는 서버/DB에서 내려주는 값을 사용한다.
const PLANS = [
  { id: 'basic', name: '베이직', price: 50000, desc: '기본 학습 관리 프로그램' },
  { id: 'standard', name: '스탠다드', price: 120000, desc: '1:1 첨삭 + 주간 리포트', popular: true },
  { id: 'premium', name: '프리미엄', price: 250000, desc: '전담 컨설턴트 밀착 관리' },
];

export default function Pricing() {
  const [loadingId, setLoadingId] = useState(null);

  async function handlePayment(plan) {
    try {
      setLoadingId(plan.id);

      const tossPayments = await getTossPayments();

      // 로그인 사용자면 user.id 를 customerKey 로, 비회원이면 ANONYMOUS 를 사용한다.
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user ?? null;
      const customerKey = user?.id ?? ANONYMOUS;

      const payment = tossPayments.payment({ customerKey });

      // 결제창 호출 → 성공 시 successUrl, 실패 시 failUrl 로 리다이렉트된다.
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: plan.price },
        orderId: createOrderId(),
        orderName: `${plan.name} 프로그램`,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerEmail: user?.email ?? undefined,
        card: {
          useEscrow: false,
          flowMode: 'DEFAULT',
          useCardPoint: false,
          useAppCardOnly: false,
        },
      });
    } catch (err) {
      // 사용자가 결제창을 닫으면 여기로 온다 (err.code === 'USER_CANCEL' 등).
      console.error('결제 요청 실패:', err);
      if (err?.code !== 'USER_CANCEL') {
        alert(`결제를 시작하지 못했습니다: ${err?.message ?? err}`);
      }
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 pt-28 pb-20">
      <section className="mx-auto max-w-7xl">
        <p className="text-sm font-bold text-blue-600">PRICING</p>
        <h1 className="mt-3 text-4xl font-extrabold text-slate-900">가격</h1>
        <p className="mt-4 text-lg text-slate-600">
          학생의 목표와 관리 범위에 따라 맞춤형 프로그램을 선택할 수 있습니다.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`flex flex-col rounded-2xl border bg-white p-8 shadow-sm ${
                plan.popular ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200'
              }`}
            >
              {plan.popular && (
                <span className="mb-4 w-fit rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  인기
                </span>
              )}
              <h2 className="text-xl font-bold text-slate-900">{plan.name}</h2>
              <p className="mt-2 text-sm text-slate-500">{plan.desc}</p>
              <p className="mt-6 text-3xl font-extrabold text-slate-900">
                {plan.price.toLocaleString()}
                <span className="ml-1 text-base font-medium text-slate-500">원 / 월</span>
              </p>

              <button
                onClick={() => handlePayment(plan)}
                disabled={loadingId === plan.id}
                className={`mt-8 w-full rounded-xl px-4 py-3 text-sm font-bold transition disabled:opacity-60 ${
                  plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {loadingId === plan.id ? '결제창 여는 중…' : '결제하기'}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-slate-400">
          ※ 토스페이먼츠 테스트 결제입니다. 실제 금액은 청구되지 않습니다.
        </p>
      </section>
    </main>
  );
}
