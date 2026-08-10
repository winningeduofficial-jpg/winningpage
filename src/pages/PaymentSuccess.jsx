import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clearCart } from '../lib/cart';
import { COMPANY } from '../data/company';

const ACCENT = '#2563EB';

// 토스 카드사 코드 → 표시명. 시안(1882-14270)이 결제수단을 '신용카드(신한)' 처럼
// 카드사명까지 붙여 적는데, 토스 승인 응답에는 card.issuerCode(2자리 코드)만 오고
// 한글 카드사명이 없어서 매핑 표가 필요하다. 미등록 코드는 카드사명을 생략하고
// '신용카드' 로만 표기한다(잘못된 카드사명을 영수증에 찍는 것보다 안전).
const CARD_ISSUERS = {
  '3K': '기업BC',
  46: '광주',
  71: '롯데',
  30: 'KDB산업',
  31: 'BC',
  51: '삼성',
  38: '새마을',
  41: '신한',
  62: '신협',
  36: '씨티',
  33: '우리BC',
  W1: '우리',
  37: '우체국',
  39: '저축',
  35: '전북',
  42: '제주',
  15: '카카오뱅크',
  '3A': '케이뱅크',
  24: '토스뱅크',
  21: '하나',
  61: '현대',
  11: 'KB국민',
  91: 'NH농협',
  34: '수협'
};

// 토스 은행 코드 → 표시명. 가상계좌 응답이 bank(한글명)를 주는 경우도 있어
// 그쪽을 먼저 쓰고, 없을 때만 이 표로 코드를 푼다.
const BANKS = {
  '02': 'KDB산업은행',
  '03': 'IBK기업은행',
  '04': 'KB국민은행',
  '06': 'KB국민은행',
  '07': '수협은행',
  11: 'NH농협은행',
  12: '단위농협',
  20: '우리은행',
  23: 'SC제일은행',
  27: '씨티은행',
  31: 'DGB대구은행',
  32: '부산은행',
  34: '광주은행',
  35: '제주은행',
  37: '전북은행',
  39: '경남은행',
  45: '새마을금고',
  48: '신협',
  50: '저축은행',
  54: 'HSBC은행',
  64: '산림조합',
  71: '우체국',
  81: '하나은행',
  88: '신한은행',
  89: '케이뱅크',
  90: '카카오뱅크',
  92: '토스뱅크'
};

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

// ISO 문자열 → "YYYY.MM.DD" (입금기한은 시안에서 날짜만 노출한다)
function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function formatKRW(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${Number(value).toLocaleString('ko-KR')}원`;
}

// 토스 결제수단 표시명 (간편결제는 provider, 카드는 '신용카드(신한)' 형태)
function methodLabel(payment) {
  if (payment?.easyPay?.provider) return payment.easyPay.provider;

  if (payment?.card) {
    // cardType 은 '신용' | '체크' | '기프트' 로 온다. 시안은 신용카드 케이스만
    // 그렸지만 체크카드도 같은 화면을 쓰므로 응답값을 그대로 붙인다.
    const cardType = String(payment.card.cardType || '').trim();
    const base = cardType ? `${cardType}카드` : payment.method || '신용카드';
    const issuer = CARD_ISSUERS[String(payment.card.issuerCode || '').trim()];
    return issuer ? `${base}(${issuer})` : base;
  }

  return payment?.method || '-';
}

// 시안(1882-14270)은 '4895-4589-****-****' 로 앞 8자리만 노출한다. 토스도 이미
// 일부를 가려서 주지만(예: 43301234****123*) 가리는 자리가 달라, 뒤 8자리를
// 다시 '*' 로 덮은 뒤 4자리씩 하이픈으로 끊는다.
function formatCardNumber(raw) {
  const value = String(raw || '').replace(/[^0-9*]/g, '');
  if (!value) return '-';
  const length = Math.max(value.length, 12); // 12 = 최소 카드번호 자릿수
  const masked = value.slice(0, 8).padEnd(8, '*') + '*'.repeat(length - 8);
  return masked.match(/.{1,4}/g).join('-');
}

// 0개월 = 일시불 (시안 1882-14270)
function installmentLabel(months) {
  const value = Number(months || 0);
  return value > 0 ? `${value}개월` : '일시불';
}

// 시안(1882-14746)은 '신한은행 110-260-365412' 로 은행명 + 계좌번호를 한 줄에 쓴다.
function accountLabel(virtualAccount) {
  const bank = String(virtualAccount?.bank || '').trim() || BANKS[String(virtualAccount?.bankCode || '').trim()];
  const accountNumber = String(virtualAccount?.accountNumber || '').trim();
  if (!accountNumber) return '-';
  return bank ? `${bank} ${accountNumber}` : accountNumber;
}

// 완료 화면의 행 구성은 결제수단마다 다르다.
//   공통     : 주문번호 … 부가가치세 금액 · 총 결제 금액   (시안 E 클러스터 9프레임 공통)
//   간편결제 : + 결제수단, 승인 시간                        (1882-13833)
//   카드     : + 결제수단(카드사명 병기), 카드번호, 할부 개월, 카드사 승인 번호, 승인 시간 (1882-14270)
//   가상계좌 : + 가상계좌 번호, 입금자명, 입금기한 — 결제수단·승인 시간 행이 없다 (1882-14746)
// 보류 2건:
//   · '이용 시작일' 행 — orders 에 시작일/이용기간 컬럼이 없어 원천 값이 없다.
//   · 시간 행 라벨 — 시안이 노드별로 3종('최종 승인 시간' 1882-13833 / '결제 요청 시간 및
//     최종 승인 시간' 1882-14270 / '결제 요청 시간' 1882-14145)이라 코드 기존 문구를 유지.
function buildRows({ payment, orderId, totalAmount, vat }) {
  const rows = [{ label: '주문번호', value: payment?.orderId || orderId }];
  const card = payment?.card;
  const virtualAccount = payment?.virtualAccount;
  // 간편결제(토스페이 등)도 응답에 card 가 실려 올 수 있지만, 토스페이 시안
  // (1882-13833)은 카드 3행을 그리지 않는다. 그래서 카드 3행은 간편결제가 아닌
  // 순수 카드결제에서만 노출한다.
  const isCardPayment = Boolean(card) && !payment?.easyPay?.provider;

  if (virtualAccount) {
    rows.push({ label: '가상계좌 번호', value: accountLabel(virtualAccount) });
    rows.push({ label: '입금자명', value: String(virtualAccount.customerName || '').trim() || '-' });
    rows.push({ label: '입금기한', value: formatDate(virtualAccount.dueDate) });
  } else {
    rows.push({ label: '결제수단', value: methodLabel(payment) });
    if (isCardPayment) {
      rows.push({ label: '카드번호', value: formatCardNumber(card.number) });
      rows.push({ label: '할부 개월', value: installmentLabel(card.installmentPlanMonths) });
      rows.push({ label: '카드사 승인 번호', value: String(card.approveNo || '').trim() || '-' });
    }
    rows.push({
      label: '최종 승인 시간',
      value: formatDateTime(payment?.approvedAt || payment?.requestedAt)
    });
  }

  rows.push({ label: '부가가치세 금액', value: formatKRW(vat) });
  rows.push({ label: '총 결제 금액', value: formatKRW(totalAmount) });
  return rows;
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
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: JSON.stringify({ paymentKey, orderId, amount })
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

  const rows = buildRows({ payment, orderId, totalAmount, vat });

  // 가상계좌(토스 status = WAITING_FOR_DEPOSIT)는 계좌 발급까지만 끝난 상태지만,
  // 헤딩·아이콘은 분기하지 않는다 — 시안 가상계좌 프레임(1882-14746 / 1882-14898)도
  // 같은 상태에서 '주문이 완료됐어요!'를 쓰고 코드 기존 문구도 같다. 미입금 사실은
  // buildRows 가 넣는 '가상계좌 번호 / 입금자명 / 입금기한' 3행이 표현한다.
  // (별도 안내 문구를 새로 쓰려면 문구 승인이 먼저다 — 승인 대기 항목.)

  return (
    <>
      <main className="min-h-screen bg-white pt-16">
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
            <h1 className="text-2xl font-black text-red-600">
              {errorMsg || '결제 승인에 실패했습니다.'}
            </h1>
            <Link
              to="/pricing"
              className="mt-8 rounded-xl bg-[#0D1B2A] px-8 py-3.5 text-sm font-black text-white transition hover:bg-[#162A40]"
            >
              결제 페이지로 돌아가기
            </Link>
          </div>
        )}

        {status === 'done' && (
          /* 시안 확정 실측: 완료 카드 폭 650px 고정(=40.625rem, 1920·1280·390 동일).
             바깥 컨테이너는 폭을 잡지 않고 좌우 패딩만 줘서, 390(콘텐츠 310px)에서
             카드가 패딩 안쪽으로 줄어들며 가로 스크롤이 생기지 않게 한다. */
          <div className="px-5 py-12 text-center sm:px-6 sm:py-16">
            <CheckCircle2 size={64} strokeWidth={2} color={ACCENT} className="mx-auto" />
            <h1 className="mt-8 text-[2.25rem] font-black tracking-[-0.02em] text-[#0D1B2A]">
              주문이 완료됐어요!
            </h1>

            <div className="mx-auto mt-10 w-full max-w-[40.625rem] rounded-2xl border border-slate-200 px-5 py-5 text-left shadow-[0_10px_40px_rgba(13,27,42,0.06)] sm:mt-12 sm:px-8 sm:py-6">
              <dl>
                {rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 py-3 sm:gap-6 sm:py-4"
                  >
                    <dt className="shrink-0 text-[0.875rem] font-bold text-[#111111]">
                      {row.label}
                    </dt>
                    <dd className="break-all text-right text-[0.9375rem] font-bold text-[#111111]">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* 이용 안내 (수동 운영) */}
            <div className="mx-auto mt-6 w-full max-w-[40.625rem] rounded-2xl border border-blue-100 bg-blue-50/50 px-5 py-5 text-left sm:px-6">
              <p className="text-[0.875rem] font-black text-[#0D1B2A]">이용 안내</p>
              <p className="mt-2 break-keep text-[0.8125rem] leading-relaxed text-slate-600">
                결제해 주셔서 감사합니다. 담당 매니저가 영업일 기준 1~2일 이내에 등록하신
                연락처(카카오톡·이메일·전화)로 서비스 이용 방법을 안내드립니다. 서비스별 진행 방식은
                이용약관 및 담당자 안내를 따릅니다.
              </p>
              <p className="mt-3 text-[0.78125rem] font-bold text-slate-500">
                문의: 카카오톡 {COMPANY.kakao} · 대표전화 {COMPANY.tel} · 센터문의{' '}
                {COMPANY.centerTel}
              </p>
            </div>

            {/* CTA 는 390에서 카드 폭(=풀폭), sm 이상에서 내용 폭. 문구는 운영 모델
                (수동 안내 vs 즉시 입장)이 확정되기 전까지 코드 기존값을 유지한다. */}
            <div className="mx-auto mt-8 w-full max-w-[40.625rem] sm:mt-10">
              <button
                type="button"
                onClick={() => navigate('/mypage')}
                className="w-full rounded-xl py-4 text-[0.9375rem] font-black text-white shadow-[0_12px_30px_rgba(53,56,238,0.28)] transition hover:brightness-95 sm:w-auto sm:px-16"
                style={{ backgroundColor: ACCENT }}
              >
                마이페이지에서 확인하기
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
