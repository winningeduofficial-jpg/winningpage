import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';
import { supabase } from '../lib/supabase';
import { clearCart } from '../lib/cart';
import { COMPANY } from '../data/company';

const ACCENT = '#2563EB';

function pad(n) {
  return String(n).padStart(2, '0');
}

// ISO 문자열 → "YYYY.MM.DD-HH:mm:ss"
function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}-${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

function formatKRW(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${Number(value).toLocaleString('ko-KR')}원`;
}

// 토스 결제수단 표시명 (간편결제는 provider 우선)
function methodLabel(payment) {
  if (payment?.easyPay?.provider) return payment.easyPay.provider;
  return payment?.method || '-';
}

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paymentKey = params.get('paymentKey');
  const orderId = params.get('orderId');
  const amount = params.get('amount');

  const [status, setStatus] = useState('confirming'); // confirming | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [payment, setPayment] = useState(null); // 승인 응답(토스 raw)

  useEffect(() => {
    if (!paymentKey || !orderId || !amount) {
      setStatus('error');
      setErrorMsg('필수 결제 정보가 없습니다.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
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
          setPayment(result);
          setStatus('done');
          clearCart();
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

  const totalAmount = payment?.totalAmount ?? Number(amount);
  const vat = payment?.vat ?? (totalAmount ? Math.round(Number(totalAmount) / 11) : null);
  const approvedAt = payment?.approvedAt;

  const rows = [
    { label: '주문번호', value: payment?.orderId || orderId },
    { label: '결제수단', value: methodLabel(payment) },
    { label: '최종 승인 시간', value: formatDateTime(approvedAt || payment?.requestedAt) },
    { label: '부가가치세 금액', value: formatKRW(vat) },
    { label: '총 결제 금액', value: formatKRW(totalAmount) },
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white pt-[84px]">
        {status === 'confirming' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <div
              className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200"
              style={{ borderTopColor: ACCENT }}
            />
            <p className="mt-5 text-lg font-bold text-[#0D1B2A]">결제 승인 처리 중…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
            <h1 className="text-2xl font-black text-red-600">{errorMsg || '결제 승인에 실패했습니다.'}</h1>
            <Link
              to="/pricing"
              className="mt-8 rounded-xl bg-[#0D1B2A] px-8 py-3.5 text-sm font-black text-white transition hover:bg-[#162A40]"
            >
              결제 페이지로 돌아가기
            </Link>
          </div>
        )}

        {status === 'done' && (
          <div className="mx-auto max-w-[900px] px-6 py-16 text-center">
            <CheckCircle2 size={64} strokeWidth={2} color={ACCENT} className="mx-auto" />
            <h1 className="mt-8 text-[36px] font-black tracking-[-0.02em] text-[#0D1B2A]">주문이 완료됐어요!</h1>

            <div className="mx-auto mt-12 max-w-[720px] rounded-2xl border border-slate-200 px-8 py-6 text-left shadow-[0_10px_40px_rgba(13,27,42,0.06)]">
              <dl>
                {rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-6 py-4">
                    <dt className="text-[14px] font-bold text-[#111111]">{row.label}</dt>
                    <dd className="break-all text-right text-[15px] font-bold text-[#111111]">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* 이용 안내 (수동 운영) */}
            <div className="mx-auto mt-6 max-w-[720px] rounded-2xl border border-blue-100 bg-blue-50/50 px-6 py-5 text-left">
              <p className="text-[14px] font-black text-[#0D1B2A]">이용 안내</p>
              <p className="mt-2 break-keep text-[13px] leading-relaxed text-slate-600">
                결제해 주셔서 감사합니다. 담당 매니저가 영업일 기준 1~2일 이내에 등록하신 연락처(카카오톡·이메일·전화)로
                서비스 이용 방법을 안내드립니다. 서비스별 진행 방식은 이용약관 및 담당자 안내를 따릅니다.
              </p>
              <p className="mt-3 text-[12.5px] font-bold text-slate-500">
                문의: 카카오톡 {COMPANY.kakao} · 대표전화 {COMPANY.tel} · 센터문의 {COMPANY.centerTel}
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/mypage')}
              className="mt-10 rounded-xl px-16 py-4 text-[15px] font-black text-white shadow-[0_12px_30px_rgba(53,56,238,0.28)] transition hover:brightness-95"
              style={{ backgroundColor: ACCENT }}
            >
              마이페이지에서 확인하기
            </button>
          </div>
        )}

        <SiteFooter />
      </main>
    </>
  );
}
