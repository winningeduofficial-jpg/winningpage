import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clearCart } from '../lib/cart';
import { openPaidServiceOrAlert } from '../lib/paidServiceAccess';
import { COMPANY } from '../data/company';

const ACCENT = '#2563EB';

// 부여된 program_key → '프로그램 시작하기' 목적지.
//
// 즉시 입장 모델이라 CTA 는 결제 직후 실제 서비스로 들어가야 한다. 입장(SSO)이
// 성립하는 서비스는 goal·suhaeng 2건뿐이다(api/create-service-ticket.js:7-22 의
// SERVICE_CONFIGS, src/lib/paidServiceAccess.js:5 의 PAID_SERVICE_CONFIGS).
//
// 키는 service_key 가 아니라 **부여 결과(access.granted)의 program_key** 다
// (api/_lib/programAccess.js 가 program_key 배열을 돌려준다). 두 서비스는
// service_key = program_key 로 같은 문자열이지만, 기준을 granted 로 두면 "권한이
// 실제로 들어간 것만 입장 버튼이 생긴다"가 코드로 보장된다 — 결제만 되고 부여가
// 없는 상품에 입장 버튼을 띄우는 사고를 구조적으로 막는다.
//
// openPaidServiceOrAlert 는 service_key 를 직접 받지 않고 서비스 설명 텍스트를
// 키워드로 매칭한다(src/lib/paidServiceAccess.js:9-60). 그 파일은 이번 작업
// 범위가 아니라 API 를 못 바꾸므로, 매칭에 걸리는 대표 토큰을 slug 로 넘긴다.
// 매칭이 실패하면 같은 함수가 link 로 이동하므로 상세 페이지가 폴백이 된다.
const SERVICE_ENTRY = {
  goal: { serviceKey: 'goal', slug: 'goal', link: '/services/goal', label: '목표관리' },
  suhaeng: {
    serviceKey: 'suhaeng',
    slug: '수행평가',
    link: '/services/performance',
    label: '수행평가'
  }
};

// 구매 내역 확인 경로. 로그인이 필요하므로(src/pages/MyPage.jsx:133 이 세션 없으면
// /login 으로 보낸다) 회원 주문에서만 CTA 로 쓴다.
const FALLBACK_PATH = '/mypage';

// 새로고침으로 복구되지 않는 부여 실패.
//
// 부여 실패 사유는 두 종류인데 안내가 같으면 안 된다. DB 일시 오류는 재시도로
// 풀리지만, 아래 사유들은 몇 번 새로고침해도 같은 결과다 — 비회원 결제(주문에
// 권한을 줄 계정이 없다)·주문 없음·라인아이템 없음·서버 설정 누락·주문 소유자
// 불일치는 모두 요청을 반복해서 바뀌는 값이 아니다. 사유 문자열의 정본은
// api/_lib/programAccess.js 와 api/confirm-payment.js:accessNotAttempted 다.
const PERMANENT_ACCESS_ERRORS = new Set([
  'order_has_no_user',
  'order_not_found',
  'no_order_items',
  'missing_order_id',
  'supabase_admin_unavailable'
]);

// 'not_order_owner' 는 실패가 아니다.
//   api/confirm-payment.js 는 이미 결제완료된 주문에 대한 재부여를 주문 소유자
//   본인일 때만 시도한다(그 검사가 없으면 orderId 만 아는 요청으로 남의 권한을
//   되살릴 수 있다). 로그아웃 상태로 성공 URL 을 다시 열면 그 검사에 걸려
//   ok=false 로 오는데, 이건 "부여가 실패했다"가 아니라 "확인할 수 없어 시도하지
//   않았다"다. 경고색·문의 안내를 띄우면 아무 문제 없는 사용자를 겁주게 되므로
//   로그인 안내로 따로 분기한다.
const NOT_OWNER_ERROR = 'not_order_owner';

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
//
// '이용 시작일' 행: 즉시 입장 모델이므로 이용 시작 = 결제 확정 시각이다. orders 에
// 시작일 컬럼을 새로 만들지 않고 승인 시각(= api/confirm-payment.js 가 orders.paid_at
// 에 찍는 값과 같은 순간)에서 파생해 표시한다. 가상계좌는 아직 입금 전이라 시작일이
// 없으므로 이 행을 넣지 않는다(입금기한 행이 그 상태를 표현한다).
//
// 보류 1건:
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
    rows.push({
      label: '이용 시작일',
      value: formatDate(payment?.approvedAt || payment?.requestedAt)
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

  // 이용 권한 부여 결과. api/confirm-payment.js 가 승인 응답에 실어 준다
  // (형태: { ok, granted, serviceKeys, skipped, error }).
  const access = payment?.access ?? null;

  // 가상계좌 미입금 상태 판정. 승인 응답의 토스 status 가 정본이고, 멱등 재응답
  // 경로도 같은 값을 채운다(api/confirm-payment.js). 과거 주문(raw 없음)에서
  // status 가 비어 오는 경우를 대비해 virtualAccount 존재로도 한 번 더 본다.
  const isWaitingDeposit =
    payment?.status === 'WAITING_FOR_DEPOSIT' ||
    (Boolean(payment?.virtualAccount) && payment?.status !== 'DONE');

  // 결제는 됐는데 권한 부여만 실패한 상태(부여 실패는 승인을 되돌리지 않는다).
  // 이때 '프로그램 시작하기'를 눌러도 입장 판정에서 막히므로 CTA 를 바꾸지 않고
  // 대신 복구 안내를 보여준다.
  // 로그인 안 된 재방문(재부여를 시도하지 않은 상태). 실패로 취급하지 않는다.
  const needsLogin = !isWaitingDeposit && access?.error === NOT_OWNER_ERROR;
  const grantFailed = !isWaitingDeposit && !needsLogin && access?.ok === false;
  // 새로고침 안내를 붙일 수 있는 실패인지. 영구 실패에 '새로고침하면 자동 재시도'
  // 라고 쓰면 사실이 아닌 안내를 반복해서 읽히게 된다.
  const grantPermanent = grantFailed && PERMANENT_ACCESS_ERRORS.has(String(access?.error ?? ''));
  // 비회원 결제만 사용자가 스스로 풀 수 있는 길(회원가입)이 있다.
  const needsSignup = grantPermanent && access?.error === 'order_has_no_user';

  // 입장 버튼은 "권한이 실제로 들어간 프로그램" 개수만큼 만든다. 수시예측·콜멘토
  // 처럼 부여 대상이 없는 상품은 access.ok=true + granted=[] 로 돌아오므로
  // (api/_lib/programAccess.js 의 skipped) 여기서 0개가 되어 CTA 가 내려간다.
  const entries = (access?.granted ?? []).map((key) => SERVICE_ENTRY[key]).filter(Boolean);
  const canStart = !isWaitingDeposit && !grantFailed && entries.length > 0;
  // 부여는 정상 종료됐는데 들어갈 프로그램이 없는 상품(수시예측·콜멘토 등).
  // '지금 바로 이용' + '프로그램 시작하기' 를 띄우면 사실과 다르다.
  const noEntryProduct = !isWaitingDeposit && access?.ok === true && entries.length === 0;

  async function handleStart(event, entry) {
    // 입장권(SSO 티켓)을 받아 자식 앱으로 이동한다. 실패 시 함수 내부에서
    // alert 를 띄우고 커서를 복구한다.
    await openPaidServiceOrAlert(event, entry);
  }

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
          /* 시안 확정 실측: 완료 카드 폭 650px 고정(=40.625rem, 1920·1280 동일).
             카드의 max-w-[40.625rem] 은 시안 확정값이라 건드리지 않고, 바깥
             컨테이너를 전역 컨텐츠 영역 규약 `mx-auto w-full max-w-content px-5
             sm:px-8` 로 통일한다(Pricing.jsx:100-119 주석의 근거 참고. 세로
             패딩만 이 화면 고유값으로 남긴다).
             폭별 규약 inner = sm 이상 min(layout − 64, 1100) / sm 미만 layout − 40:
             390 → 350, 768 → 704, 1280·1920 → 1100. 카드는 inner 와 650 중
             작은 쪽이 되므로 layout 714(= 650 + 64) 이상에서 650 으로 고정되고,
             그 아래에서는 규약 inner 안쪽으로 줄어들어 가로 스크롤이 없다.
             sm 게이터를 px-6(24) 에서 규약값 px-8(32) 로 올렸다. 그 결과
             layout 640~713 밴드에서만 카드가 좁아진다 — 이전 카드 = min(layout −
             48, 650), 지금 = min(layout − 64, 650) 이므로 차이는 640~698 에서
             16px(640: 592 → 576 / 698: 650 → 634), 700 에서 14px(650 → 636),
             713 에서 1px(650 → 649), 714 부터 0 이다(실측 확인).
             의도된 변경이다 — 이 밴드는 시안이 없는 파생 구간이고(시안 캔버스는
             390/1280/1920), 이전 값은 카드가 규약 콘텐츠 밴드 밖으로 좌우 각
             8px(640) / 7px(700) 비어져 나간 상태였다. 규약 안에서 클램프되는
             편이 낫다는 판단이다. */
          <div className="mx-auto w-full max-w-content px-5 py-12 text-center sm:px-8 sm:py-16">
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

            {/* 이용 안내 — 운영 모델은 '즉시 입장'(사용자 확정)이다. 결제 승인
                시점에 api/confirm-payment.js 가 권한을 자동 부여하므로 "담당
                매니저가 영업일 1~2일 내 안내"(수동 프로비저닝) 문구는 삭제했다.
                상태별로 사실이 다르므로 6분기로 쓴다(입금대기 / 로그인 필요 /
                영구 실패 / 재시도 가능 실패 / 입장 대상 없는 상품 / 즉시 입장).

                '마이페이지에서 바로/이어서 이용' 약속은 전부 뺐다 — 마이페이지
                '이용 중인 서비스' 목록에 입장 수단이 없어서(src/pages/MyPage.jsx:
                470-497, openPaidServiceOrAlert 호출 0건) 지킬 수 없는 약속이다.
                마이페이지에 입장 버튼이 들어가면 그때 되살릴 문구다. */}
            <div
              className={`mx-auto mt-6 w-full max-w-[40.625rem] rounded-2xl border px-5 py-5 text-left sm:px-8 ${
                grantFailed ? 'border-amber-200 bg-amber-50/60' : 'border-blue-100 bg-blue-50/50'
              }`}
            >
              <p className="text-[0.875rem] font-black text-[#0D1B2A]">
                {isWaitingDeposit
                  ? '입금 안내'
                  : needsLogin
                    ? '로그인 후 이용'
                    : grantPermanent
                      ? '이용 등록 확인이 필요합니다'
                      : grantFailed
                        ? '이용 권한 등록 지연'
                        : '이용 안내'}
              </p>
              {/* 문구는 각 상태에서 "검증 가능한 사실"만 남긴 초안이다 — 최종 문안은
                  사용자 승인 대기(입장 앱 없는 상품 안내 / 비회원 결제 안내 2건). */}
              <p className="mt-2 break-keep text-[0.8125rem] leading-relaxed text-slate-600">
                {isWaitingDeposit
                  ? '위 가상계좌로 입금기한 내에 입금해 주세요. 입금이 확인되면 이용 권한이 자동으로 부여됩니다.'
                  : needsLogin
                    ? '결제가 확인되었습니다. 이용 권한은 결제하신 계정에 등록되어 있습니다. 로그인하신 뒤 이용해 주세요.'
                    : needsSignup
                      ? '결제는 정상적으로 완료됐습니다. 다만 비회원으로 결제하셔서 이용 권한을 넣어 드릴 계정이 없습니다. 아래 버튼으로 회원가입하신 뒤 주문번호와 함께 문의해 주시면 바로 등록해 드립니다.'
                      : grantPermanent
                      ? '결제는 정상적으로 완료됐습니다. 다만 이 주문은 이용 권한 자동 등록이 되지 않아 확인이 필요합니다. 아래 연락처로 주문번호와 함께 문의해 주시면 바로 등록해 드립니다.'
                      : grantFailed
                        ? '결제는 정상적으로 완료됐습니다. 다만 이용 권한 등록이 아직 끝나지 않았습니다. 이 페이지를 새로고침하면 자동으로 다시 시도되며, 계속 같은 안내가 보이면 아래 연락처로 주문번호와 함께 문의해 주세요.'
                        : noEntryProduct
                          ? '결제가 확인되었습니다. 이 상품은 별도 입장 화면 없이 진행되는 서비스라, 이용 방법은 아래 연락처로 안내드립니다. 주문 내역은 마이페이지에서 확인할 수 있습니다.'
                          : entries.length > 1
                            ? '결제가 확인되어 지금 바로 이용할 수 있습니다. 아래 버튼으로 각 프로그램에 입장해 주세요.'
                            : '결제가 확인되어 지금 바로 이용할 수 있습니다. 아래 버튼으로 프로그램에 입장해 주세요.'}
              </p>
              <p className="mt-3 text-[0.78125rem] font-bold text-slate-500">
                문의: 카카오톡 {COMPANY.kakao} · 대표전화 {COMPANY.tel} · 센터문의{' '}
                {COMPANY.centerTel}
              </p>
            </div>

            {/* CTA 는 390에서 카드 폭(=풀폭), sm 이상에서 내용 폭.
                즉시 입장이므로 기본 CTA 는 '프로그램 시작하기'다. 눌러도 막히는
                버튼은 만들지 않는다 — 그래서 목적지가 실제로 성립하는 경우만 버튼을
                띄운다.
                  · 권한이 들어간 프로그램이 여러 개면 버튼도 그 개수만큼 만든다.
                    하나로 묶어 마이페이지로 보내면 거기에 입장 수단이 없어서
                    (MyPage.jsx:470-497) 두 프로그램 어디에도 못 들어간다.
                  · 로그아웃 재방문은 로그인이 곧 해결이므로 /login 으로 보낸다.
                  · 비회원 결제는 회원가입이 유일한 자력 복구 경로다.
                  · 그 외 영구 실패는 로그인 벽인 /mypage 로 보내지 않고(비회원은
                    MyPage.jsx:133 에서 /login 으로 튕긴다) 전화 문의만 남긴다.
                    카카오톡은 채널 URL 정본이 없어 링크로 걸지 않았다(문의 줄에
                    아이디로 노출). */}
            <div className="mx-auto mt-8 w-full max-w-[40.625rem] sm:mt-10">
              {canStart ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  {entries.map((item) => (
                    <button
                      key={item.serviceKey}
                      type="button"
                      onClick={(event) => handleStart(event, item)}
                      className="w-full rounded-xl py-4 text-[0.9375rem] font-black text-white shadow-[0_12px_30px_rgba(53,56,238,0.28)] transition hover:brightness-95 sm:w-auto sm:px-16"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {entries.length > 1 ? `${item.label} 시작하기` : '프로그램 시작하기'}
                    </button>
                  ))}
                </div>
              ) : needsLogin ? (
                <Link
                  to="/login"
                  className="block w-full rounded-xl py-4 text-center text-[0.9375rem] font-black text-white shadow-[0_12px_30px_rgba(53,56,238,0.28)] transition hover:brightness-95 sm:mx-auto sm:w-auto sm:px-16"
                  style={{ backgroundColor: ACCENT }}
                >
                  로그인하고 이용하기
                </Link>
              ) : needsSignup ? (
                <Link
                  to="/signup"
                  className="block w-full rounded-xl py-4 text-center text-[0.9375rem] font-black text-white shadow-[0_12px_30px_rgba(53,56,238,0.28)] transition hover:brightness-95 sm:mx-auto sm:w-auto sm:px-16"
                  style={{ backgroundColor: ACCENT }}
                >
                  회원가입하고 이용 등록하기
                </Link>
              ) : grantPermanent ? (
                <a
                  href={`tel:${COMPANY.centerTel}`}
                  className="block w-full rounded-xl py-4 text-center text-[0.9375rem] font-black text-white shadow-[0_12px_30px_rgba(53,56,238,0.28)] transition hover:brightness-95 sm:mx-auto sm:w-auto sm:px-16"
                  style={{ backgroundColor: ACCENT }}
                >
                  센터로 문의하기
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(FALLBACK_PATH)}
                  className="w-full rounded-xl py-4 text-[0.9375rem] font-black text-white shadow-[0_12px_30px_rgba(53,56,238,0.28)] transition hover:brightness-95 sm:w-auto sm:px-16"
                  style={{ backgroundColor: ACCENT }}
                >
                  마이페이지에서 확인하기
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
