import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { clearCart } from '../lib/cart';

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const paymentKey = params.get('paymentKey');
  const orderId = params.get('orderId');
  const amount = params.get('amount');

  const [status, setStatus] = useState('confirming'); // confirming | done | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!paymentKey || !orderId || !amount) {
      setStatus('error');
      setErrorMsg('필수 결제 정보가 없습니다.');
      return;
    }

    // 서버(api/confirm-payment)에 승인 요청. 여기서 시크릿 키로 토스 승인 API가 호출된다.
    let cancelled = false;
    (async () => {
      try {
        // 로그인 사용자면 access_token 을 함께 보내서 서버가 결제-사용자를 매핑할 수 있게 한다.
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        const res = await fetch('/api/confirm-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });

        let result = {};
        try {
          result = await res.json();
        } catch {
          result = {};
        }

        if (cancelled) return;

        if (!res.ok || result?.error) {
          setStatus('error');
          setErrorMsg(result?.error ?? '결제 승인에 실패했습니다.');
        } else {
          setStatus('done'); // 승인 완료
          clearCart(); // 결제 완료 → 선택 항목 비우기
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(String(err?.message ?? err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentKey, orderId, amount]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      {status === 'confirming' ? (
        <h1 className="text-2xl font-bold text-slate-900">결제 승인 처리 중…</h1>
      ) : status === 'done' ? (
        <>
          <h1 className="text-3xl font-extrabold text-slate-900">결제 완료 ✅</h1>
          <p className="mt-3 text-slate-600">결제가 정상적으로 승인되었습니다.</p>
          <dl className="mt-8 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-left text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-slate-500">주문번호</dt>
              <dd className="font-medium text-slate-900">{orderId}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-slate-500">결제금액</dt>
              <dd className="font-medium text-slate-900">
                {Number(amount).toLocaleString()}원
              </dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-slate-500">paymentKey</dt>
              <dd className="max-w-[220px] truncate font-mono text-xs text-slate-700">
                {paymentKey}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <h1 className="text-2xl font-bold text-red-600">
          {errorMsg || '결제 승인에 실패했습니다.'}
        </h1>
      )}

      <Link
        to="/pricing"
        className="mt-8 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800"
      >
        가격 페이지로 돌아가기
      </Link>
    </main>
  );
}
