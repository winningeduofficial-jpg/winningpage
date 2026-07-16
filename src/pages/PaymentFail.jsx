import { Link, useSearchParams } from 'react-router-dom';

export default function PaymentFail() {
  const [params] = useSearchParams();
  const code = params.get('code');
  const message = params.get('message');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <h1 className="text-3xl font-extrabold text-slate-900">결제 실패 ❌</h1>
      <p className="mt-3 text-slate-600">{message ?? '결제가 취소되었거나 실패했습니다.'}</p>
      {code && <p className="mt-1 text-xs text-slate-400">오류코드: {code}</p>}

      <Link
        to="/pricing"
        className="mt-8 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800"
      >
        다시 시도하기
      </Link>
    </main>
  );
}
