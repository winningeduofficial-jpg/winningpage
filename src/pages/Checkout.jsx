import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTossPayments, ANONYMOUS } from '../lib/toss';
import { formatKRW } from '../data/pricingCatalog';
import { CHECKOUT_AGREEMENTS } from '../data/legalDocs';
import { getCart, saveCart } from '../lib/cart';

// 라벨은 시안 문자열 그대로. '신용 /체크 카드' 의 공백 위치(슬래시 앞에만 공백)는
// 덤프 18개 프레임 전부에서 동일하다 — 코드의 '신용 / 체크카드' 와 달라 시안에 맞췄다.
const PAY_METHODS = [
  { key: 'tosspay', label: '토스페이', tossMethod: 'CARD' }, // 간편결제는 카드창 내에서 제공
  { key: 'card', label: '신용 /체크 카드', tossMethod: 'CARD' },
  { key: 'virtual', label: '가상계좌', tossMethod: 'VIRTUAL_ACCOUNT' }
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
        <ChevronDown
          size={18}
          className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-slate-100 px-4 py-3.5">{children}</div>}
    </div>
  );
}

// 약관 전문 (스크롤 영역). 제N조 / [소제목] / <소제목> / 번호 목차는 굵게.
// docTitle: 결제 약관 아코디언에만 쓴다. 펼친 시안(3437-2625·1882-12381·1882-12689)에서
//   결제 약관 본문은 '결제 서비스 이용 및 개인정보 처리 약관' 으로 시작하지만,
//   구매 전 안내사항 본문은 '<환불규정>' 으로 바로 시작해 타이틀 라인이 없다.
//   즉 일반 규칙이 아니라 결제 약관 한정이다. legalDocs.js 본문은 법무 확정 사항이라
//   건드리지 않고, 표시 계층에서만 타이틀을 얹는다.
// 스크롤 높이: 390 시안(1882-12689) 실측 122px ÷16 = 7.625rem, 1280/1920은 기존 240px ÷16 = 15rem.
//   시안 BP가 390/1280/1920뿐이라 640~1183 구간엔 실측 근거가 없다. 이 파일의 보간 전환점은
//   sm(640) 하나로 통일했다 — 서비스 설명 노출, 결제수단 3열, '쿠폰할인가' 문구가 모두 같은
//   기준을 쓴다. (md(768)였던 이 값만 어긋나 있어 sm 으로 맞췄다.)
function AgreementText({ text, docTitle }) {
  const lines = text.split('\n');
  return (
    <div className="max-h-[7.625rem] overflow-y-auto pr-1.5 text-[12px] leading-relaxed text-slate-500 sm:max-h-[15rem]">
      {docTitle && <p className="mb-1.5 font-bold text-[#0D1B2A]">{docTitle}</p>}
      {lines.map((line, i) => {
        const t = line.trim();
        if (t === '') return <div key={i} className="h-2" />;
        const heading =
          /^제\d+조/.test(t) ||
          /^\[.*\]$/.test(t) ||
          /^<.*>$/.test(t) ||
          /^부칙/.test(t) ||
          /^\d+\.\s/.test(t);
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

// '필수' 배지는 시안에서도 인라인이다 — 1280 프레임(1882-13258) 실측: 확인 행 1882:13399
// (h=20) 안에서 체크박스 x=0/y=4(12×12), '필수' x=20/y=0, '위 내용을 모두 확인하였습니다.'
// x=53/y=0 으로 셋이 같은 줄에 놓인다. 현재 flex 한 줄 구성과 일치해 구조를 바꾸지 않았다.
// (일부 1280 프레임은 결제 약관 아코디언 헤더까지 이 필수 행에 합쳐 놓았다. '위 내용을 모두
//  확인하였습니다' 출현수 실측: 1280 6장 중 4장(1882-13258·16903·17763·18617)만 1건(=합침)이고
//  1882-11516·12381 은 2건(=분리형), 390 6장·1920 6장은 전부 2건(=분리형)이다. 즉 합침은 1280
//  안에서도 4/6 이고, 특히 약관을 펼친 1280 프레임(1882-12381)은 분리형이다. 합치면 확인 문구가
//  사라지므로 코드는 분리형을 유지한다.)
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
  const [items, setItems] = useState(() => getCart());
  const [checkedIds, setCheckedIds] = useState(() => new Set(getCart().map((i) => i.id)));

  const [coupons, setCoupons] = useState([]);
  const [couponError, setCouponError] = useState(false);
  // 조회 완료 여부. 빈 상태 문구를 로딩 중에 먼저 띄우면(0장 → '없습니다' → 목록)
  // 화면이 한 번 깜빡이므로, 조회가 끝난 뒤에만 빈 상태를 그린다.
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const [selectedCouponIds, setSelectedCouponIds] = useState(() => new Set());
  const [couponCode, setCouponCode] = useState('');

  const [payMethod, setPayMethod] = useState('card');
  const [openNotice, setOpenNotice] = useState(false);
  const [openTerms, setOpenTerms] = useState(false);
  const [agreeNotice, setAgreeNotice] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  // 쿠폰 목록 로드. 쿠폰은 선택 요소라 조회 실패 시에도 결제 자체는 막지 않되,
  // 실패를 조용히 삼키지 않고 콘솔 경고 + 쿠폰 영역 안내로 노출한다.
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
      if (!alive) return;
      setCouponsLoaded(true);
      if (error) {
        console.warn('쿠폰 조회 실패:', error.message);
        setCouponError(true);
        return;
      }
      setCoupons(
        (data || []).map((c) => ({
          id: c.id,
          code: c.code,
          title: c.title,
          discount: c.discount_amount,
          minAmount: c.min_amount || 0,
          validUntil: c.valid_until
        }))
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const checkedItems = useMemo(
    () => items.filter((i) => checkedIds.has(i.id)),
    [items, checkedIds]
  );
  const allChecked = items.length > 0 && checkedIds.size === items.length;

  // 금액 계산
  const listTotal = checkedItems.reduce((s, i) => s + Number(i.listPrice || i.price || 0), 0);
  const subtotal = checkedItems.reduce((s, i) => s + Number(i.price || 0), 0);
  const productDiscount = listTotal - subtotal;

  // 선택된 쿠폰 중 조건 충족분만 적용, 총 할인은 subtotal 초과 불가
  const couponDiscount = useMemo(() => {
    let sum = 0;
    coupons.forEach((c) => {
      if (selectedCouponIds.has(c.id) && subtotal >= (c.minAmount || 0))
        sum += Number(c.discount || 0);
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
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          items: checkedItems.map((i) => ({ id: i.id })),
          couponIds: Array.from(selectedCouponIds)
        })
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
        <main className="flex min-h-screen flex-col items-center justify-center bg-white pt-16 text-center">
          <h1 className="text-2xl font-black text-[#0D1B2A]">선택한 상품이 없습니다</h1>
          <p className="mt-3 text-slate-500">결제할 서비스를 먼저 선택해주세요.</p>
          <Link
            to="/pricing"
            className="mt-8 rounded-xl bg-[#0D1B2A] px-8 py-3.5 text-sm font-black text-white transition hover:bg-[#162A40]"
          >
            서비스 선택하러 가기
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-white pt-16">
        {/* 주문서 콘텐츠 폭 — 시안 실측치는 '콘텐츠 폭'(좌우 패딩 제외)이고 이 div 는
            box-sizing:border-box 라서 max-w 에는 패딩을 더한 outer 값을 넣어야 한다.
            (같은 대조 기준: 전역 max-w-content 72.75rem = outer 1164 는 px-8(64) 기준이라
            inner 1100. 이 페이지는 px-6(24)라서 outer−48 로 계산해야 한다 —
            전역 토큰의 1100 을 그대로 가져다 쓰면 48px 틀린다.)
            · 390  : 콘텐츠 310px → 좌우 마진 (390−310)/2 = 40px → px-10, 상한 미적용(유동)
            · 1280 : 콘텐츠 960px  + px-6(24×2) → outer 1008px  = 63rem
            · 1920 : 콘텐츠 1518px + px-6(24×2) → outer 1566px  = 97.875rem
            상한을 base 63rem → desktop(1440) 97.875rem 2단 계단으로 끊으면 1280~1439 내내
            inner 가 960 에 고정돼 1439 에서 좌우 여백(뷰포트 좌단→콘텐츠 좌단)이
            (1439−1008)/2 + 24 = 239.5px 까지 벌어지고(1920 시안의 201px 보다도 넓다 =
            뷰포트가 커질수록 여백이 좁아지는 역전), 1440 에서 상한이 1566 으로 풀리는 순간
            컨테이너가 뷰포트 폭(1440)에 붙어 inner 960 → 1392, 여백 239.5 → 24px 로 함몰한다.
            즉 여백이 넓어졌다 붕괴했다 다시 넓어지는 이중 비단조다. Pricing.jsx:100-126 이
            같은 현상을 이유로 계단 상한을 폐기하고 유동식을 택했고, 이 페이지도 같은 해법으로
            맞춘다:
              max-w = min(97.875rem, max(63rem, 100vw − 17rem))
              · 17rem(272px) = 1280 시안 좌우 여백 160×2(320px) − 좌우 패딩 48px
              · 1280 → max(1008, 1280−272=1008) = 1008 → inner 960, 여백 160 (시안 일치)
              · 1920 → min(1566, 1920−272=1648) = 1566 → inner 1518,
                여백 (1920−1566)/2 + 24 = 201 (시안 일치)
              · 하한 교차점이 정확히 1280, 상한 도달점이 100vw−272 = 1566 → 1838 이라
                1280~1838 은 여백이 272/2 + 24 = 160 으로 일정하고 inner 만 단조 증가,
                1838~1920 은 여백이 160 → 201 로 단조 증가한다. 계단 점프가 없다.
              · 하한 63rem 덕분에 1008 미만(모바일 포함)에서는 100vw 항이 지배하지 못하고
                폭을 패딩(px-10 / sm:px-6)이 결정한다 → 390 inner 310 불변.
            검증: /checkout 은 인증 게이트라 실제 화면 실측이 불가해, 이 컨테이너와 아래 그리드만
            떼어낸 격리 CSS 리프로(동일 엔진, 스크롤바 없는 프레임)로 여백을 재측정했다 —
            AS-IS 1280:160 / 1366:203 / 1439:239.5 / 1440:24 / 1500:24 / 1566:24 / 1700:91 /
            1920:201 (붕괴 재현), TO-BE 1280~1838 내내 160 / 1920:201 (단조, 두 정본 일치).
            실제 브라우저에서 1280 만 inner 970(+10px)으로 보이는 것은 100vw 가 클래식 스크롤바
            폭을 포함하기 때문이며, Pricing 에서 이미 현행 유지로 판단된 거동이다(오버레이
            스크롤바 환경에서는 정확히 960).
            패딩 전환점 sm(640)은 시안 BP(390/1280/1920) 사이 보간 판단값이다. */}
        <div className="mx-auto max-w-[min(97.875rem,max(63rem,100vw_-_17rem))] px-10 py-14 sm:px-6">
          <h1 className="mb-12 text-[38px] font-black tracking-[-0.02em] text-[#0D1B2A]">
            결제하기
          </h1>

          {/* 2컬럼 전환 임계값: 시안 1280 프레임(1882-13258 등 6장)이 1컬럼(주문상품 888 위,
              하단에 570 폭 스택)이므로 lg(1024) → desktop(90rem/1440)으로 올렸다.
              tailwind screens에 lg 재정의가 없어 lg=1024, wide=1184이라 1280을 1컬럼으로 만드는
              기존 토큰은 desktop뿐이다.

              base 를 grid-cols-1 로 '명시'하는 게 핵심이다(빈 클래스가 아니다). 트랙을 안 주면
              암시적 트랙이 auto 라 하한이 자식의 min-content(자동 최소 크기)에 잠긴다. 쿠폰 행
              제목은 truncate = white-space:nowrap 이라 min-content 가 제목 전체 폭이고, 부모
              span 의 min-w-0 는 '내재 크기 기여'를 줄이지 못한다(실측 확인 — min-w-0 를 떼도,
              flex-1 까지 떼도 트랙 하한이 제목 5종 전부에서 소수점까지 동일했다. 기여를 깎는
              효과는 0px 다) → 트랙 하한 = 32(px-4 좌우) + 2(border 1px 좌우) + 18(체크박스)
              + 12(gap) + 167.27(제목 nowrap) + 12(gap) + 47.01(금액) = 290.28px,
              width:min-content 실측 290.28px 로 잔차 0.
              · 167.27 은 '학기 초 얼리버드 특별 할인 쿠폰'(16자) 기준이고 제목이 1px 늘면 하한도
                1px 늘어난다(제목 5종에서 '하한 − 제목 nowrap' = 123.01 로 고정).
              · 47.01 은 '-6,000원'의 max-content 58.68 이 아니라 min-content 다. 금액 span 은
                nowrap 이 아니어서(shrink-0 는 내재 크기와 무관) CJK 줄바꿈 기회가 살아 있고
                '원'(11.67) 앞에서 끊긴 '-6,000' 47.01 이 최소 기여다 — 여기에 max-content 를
                넣으면 하한을 11.67px 과대평가한다.
              · 위 값들은 실행 중인 앱(동일 Tailwind 빌드 · Pretendard Variable)에 이 쿠폰 행과
                같은 클래스 문자열의 버튼을 주입해 실측한 것이다. 시안 수치가 아니다.
              컨테이너 좌패딩 40 + 트랙 290.28 > 뷰포트면 가로 스크롤이므로 W < 330.28 에서
              넘치고(320 에서 +10.28px), 390 도 여유가 390−40−290.28 = 59.72px(한글 5자, 1자
              11.67)뿐이라 쿠폰 제목이 조금만 길어지면 390 에서도 넘친다(390 의 inner 는 310 이라
              19.72px = 1.7자만 넘어도 우패딩을 잠식하기 시작한다). index.css:35 의
              min-width:min(320px,100%) 가 320 을 지원 폭으로 명시해 둔 상태다.
              grid-cols-1 = repeat(1,minmax(0,1fr)) 이라 트랙 하한이 0 이 되어 truncate 가
              의도대로 작동한다. desktop 쪽 1fr → minmax(0,1fr) 도 같은 방어다(1fr =
              minmax(auto,1fr) 이라 min-content 하한이 그대로 붙는다. 지금은 좌 컬럼 672~1070 이
              카드 min-content 206.8 을 크게 웃돌아 무해하지만, nowrap 콘텐츠가 늘면 같은 사고다).
              같은 주입 실측을 실제 뷰포트 폭에서 반복한 결과(이전에 남겨둔 격리 CSS 리프로는
              시스템 폰트라 하한 절대값이 323.22 로 달랐고, 이 실측이 그 값을 대체한다):
              AS-IS(암시적 auto) 는 320 에서 트랙이 inner 240 을 무시하고 290.28 로 고정돼
              document.scrollWidth 가 330 으로 늘어 가로 스크롤 10px 이 실제로 발생하고,
              330 에서 트랙 우단 330.28 로 딱 경계, 390 에서는 inner 310 이 하한을 넘어서서
              트랙 = inner = 310 으로 풀린다. TO-BE(grid-cols-1) 는 320/330/390 전부
              트랙 = inner(240/250/310)이고 가로 스크롤 0 이다.
              25rem = 400px 로 우 컬럼 폭은 불변, 프로젝트 단위 규칙(rem)에 맞춘 환산이다.

              위 컨테이너 유동식의 부수효과: 1440 에서 좌 컬럼이 944 → 672 로 줄어든다. 1440 에서
              '좌 960 + gap 48 + 우 400' 과 '여백 160' 은 산술적으로 양립 불가다
              (960+48+400+160×2 = 1728 > 1440). 그래서 (a) 여백 우선 = 2컬럼 전환은 desktop 유지,
              좌 컬럼이 1440:672 → 1838 이상:1070 으로 램프 / (b) 2컬럼 전환을 108rem(1728)로
              올려 좌 960 확보, 대신 1440~1727 이 1컬럼(inner 1120→1407) 중 (a) 를 택했다.
              ① 시안 정본 두 장(1280 = 1컬럼 / 1920 = 좌 1070 + 우 400)은 (a)·(b) 모두 그대로
                 만족한다 — 이 밴드는 시안이 없는 순수 보간 판단 영역이다.
              ② (b) 는 1440·1512·1536·1680 같은 최다 실사용 데스크톱 폭을 전부 1컬럼으로 남겨
                 상품 행이 1400px 넘게 늘어나고 그 밑에 570 폼만 중앙에 놓인다.
              ③ (a) 의 672 는 1280 시안이 폼에 쓰는 570 보다 넓고 카드 min-content 206.8 의
                 3배가 넘어 좁아서 깨지는 폭이 아니다.
              ④ (b) 는 tailwind screens 에 없는 108rem 임계값을 새로 만드는데, (a) 는 헤더 GNB 가
                 인라인으로 바뀌는 시점(desktop 90rem)과 레이아웃 전환을 일치시킨다. */}
          <div className="grid grid-cols-1 gap-12 desktop:grid-cols-[minmax(0,1fr)_25rem]">
            {/* 좌측: 주문 상품 */}
            <section>
              <h2 className="mb-5 text-[22px] font-black text-[#0D1B2A]">
                주문 상품 {items.length}
              </h2>

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
                    <div
                      key={item.id}
                      className="flex gap-3 rounded-2xl border border-slate-200 p-5"
                    >
                      <button
                        type="button"
                        onClick={() => toggleItem(item.id)}
                        className="mt-0.5 shrink-0"
                      >
                        <span
                          className={`flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border transition ${
                            isChecked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && (
                            <Check size={14} strokeWidth={3.5} className="text-white" />
                          )}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-[15px] font-bold text-[#0D1B2A]">{item.name}</p>
                          <div className="flex shrink-0 flex-col items-end leading-tight">
                            {hasDiscount && (
                              <span className="text-[12px] text-slate-400 line-through">
                                {formatKRW(item.listPrice)}
                              </span>
                            )}
                            <span className="flex items-center gap-2">
                              {item.badge && (
                                <span className="text-[13px] font-bold text-blue-600">
                                  {item.badge}
                                </span>
                              )}
                              <span className="text-[15px] font-black text-[#0D1B2A]">
                                {formatKRW(item.price)}
                              </span>
                            </span>
                          </div>
                        </div>
                        {/* 서비스 설명은 390 시안(1882-11814)에 없고 1280(1882-13258)·
                            1920(1882-10111)에는 있다. 시안 BP가 셋뿐이라 실제 전환점은 실측
                            근거가 없어 sm(640)으로 잡은 보간 판단값이다.
                            cart.js 저장 스키마의 serviceDesc 자체는 유지 — 세션에 남은 구버전
                            카트와의 하위호환 때문. */}
                        {item.serviceDesc && (
                          <p className="mt-2 hidden text-[12.5px] leading-relaxed text-slate-500 sm:block">
                            {item.serviceDesc}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* '선택 삭제'는 조건부 렌더를 유지한다. 덤프 18개 프레임 전부에 문자열이 있지만
                  그 프레임들은 모두 항목이 선택된 상태라, '0건 선택 시에도 노출'의 시안 근거는
                  없다. 상시 노출 + disabled 로 바꿨던 변경은 되돌렸다. */}
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

            {/* 우측: 확인/쿠폰/결제수단/금액.
                desktop 미만에서는 주문상품 아래로 내려와 1컬럼이 되는데, 그때 본문 콘텐츠 폭
                (1280 에서 inner 960, 유동식 상한 밴드의 끝 1439 에서 inner 1119) 전체로 늘어나면
                폼이 과도하게 넓어진다. 시안 1280 프레임의 하단 스택 폭 570px
                ÷16 = 35.625rem을 상한으로 걸고 가운데 정렬한다(시안도 888 안에서 좌우 인셋 159로
                중앙 배치). desktop에서는 그리드 2번째 컬럼이 25rem(=400px)이라 이 상한은
                걸리지 않는다. */}
            <aside className="mx-auto w-full max-w-[35.625rem] space-y-10">
              {/* 구매 전 확인사항 */}
              <div>
                <h3 className="mb-4 text-[20px] font-black text-[#0D1B2A]">구매 전 확인사항</h3>
                <Accordion
                  title="[구매 전 안내사항]"
                  open={openNotice}
                  onToggle={() => setOpenNotice((v) => !v)}
                >
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

                {couponError && (
                  <p className="mt-3 text-[12.5px] font-bold text-red-500">
                    쿠폰을 불러오지 못했습니다.
                  </p>
                )}

                {/* 쿠폰 0장 빈 상태. 시안에 없는 문구지만, 시드 쿠폰이 만료되면 0장이 기본
                    화면이 되는데 아무것도 렌더하지 않으면 코드 입력칸만 남아 쿠폰 영역이
                    고장난 것처럼 보인다 — 그 실제 결함을 막기 위해 남긴다.
                    용어는 시안 정본인 '보유 쿠폰 N장'(덤프 18/18 프레임)에 맞춰 '보유한'으로
                    통일했다. 조회 실패는 위 couponError 가 이미 안내하므로 겹쳐 쓰지 않는다. */}
                {couponsLoaded && !couponError && coupons.length === 0 && (
                  <p className="mt-5 text-[13px] font-bold text-slate-400">
                    보유한 쿠폰이 없습니다.
                  </p>
                )}

                {coupons.length > 0 && (
                  <>
                    {/* 시안 정본 문구 — 덤프 18개 프레임 전부 '보유 쿠폰 2장'. */}
                    <p className="mb-2 mt-5 text-[13px] font-bold text-slate-500">
                      보유 쿠폰 {coupons.length}장
                    </p>
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
                                isSelected
                                  ? 'border-blue-600 bg-blue-600'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && (
                                <Check size={12} strokeWidth={3.5} className="text-white" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-bold text-[#0D1B2A]">
                                {c.title}
                              </span>
                              {c.validUntil && (
                                <span className="block text-[11.5px] text-slate-400">
                                  {String(c.validUntil).replace(/-/g, '.')}까지
                                </span>
                              )}
                            </span>
                            {/* 시안(1882-10111·3437-2974 등)은 '-6,000원'처럼 단위까지 붙는다.
                                이 파일의 다른 금액과 동일하게 formatKRW를 경유시킨다. */}
                            <span className="shrink-0 text-[13.5px] font-black text-[#0D1B2A]">
                              -{formatKRW(c.discount)}
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
                {/* 390 시안(1882-11814 등 6장)은 결제수단 버튼을 세로 1열, 폭 160px(=10rem)
                    가운데 정렬로 그린다. 1280 시안은 3열(실측 184.67px×3 + gap 8)이다.
                    시안 BP가 390/1280/1920뿐이라 전환점 sm(640)은 보간 판단값이다. */}
                <div className="mx-auto grid max-w-[10rem] grid-cols-1 gap-2 sm:max-w-none sm:grid-cols-3">
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
                  {/* 시안 C·D 전 프레임(1882-10111·3437-2974·1882-12689 등)은 아코디언 헤더를
                      '결제 서비스 이용 약관, 개인정보 처리 동의'로 쓰고, 펼친 본문 첫 줄에
                      '결제 서비스 이용 및 개인정보 처리 약관'(현재 코드 헤더 문구)을 타이틀로 둔다.
                      두 문구가 모두 시안에 존재하므로 문구 손실 없이 위치만 시안에 맞췄다.
                      기본 접힘은 유지 — 펼친 상태를 그린 프레임은 BP별 1장씩(3437-2625/
                      1882-12381/1882-12689)뿐이고 base 및 나머지 15장은 모두 접혀 있다. */}
                  <Accordion
                    title="결제 서비스 이용 약관, 개인정보 처리 동의"
                    open={openTerms}
                    onToggle={() => setOpenTerms((v) => !v)}
                  >
                    <AgreementText
                      text={CHECKOUT_AGREEMENTS.paymentAgreement}
                      docTitle="결제 서비스 이용 및 개인정보 처리 약관"
                    />
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
                  {/* 시안 3437-2974(쿠폰 적용 상태)는 '할인가'(상품할인)와 '쿠폰 할인가'를 별도 행으로
                      나눈다. 합계 로직(discountTotal·payAmount)은 그대로라 총액은 불변이다.
                      쿠폰 미적용 base 프레임(1882-10111)에는 쿠폰 행이 없으므로 0원일 때 숨긴다. */}
                  <div className="flex justify-between">
                    <dt className="text-slate-500">할인가</dt>
                    <dd className="font-bold text-blue-600">
                      {productDiscount > 0 ? `-${formatKRW(productDiscount)}` : formatKRW(0)}
                    </dd>
                  </div>
                  {couponDiscount > 0 && (
                    <div className="flex justify-between">
                      {/* 문구가 BP마다 다르다 — 390 프레임 4/4(1882-13552·17200·18057·18911)는
                          붙여쓴 '쿠폰할인가', 1280·1920 프레임 8/8(1882-13258·16903·17763·18617,
                          3437-2974·3580·3885·4187)은 공백이 있는 '쿠폰 할인가'.
                          전환점은 이 파일의 다른 보간과 같은 sm(640)으로 통일. */}
                      <dt className="text-slate-500">
                        <span className="sm:hidden">쿠폰할인가</span>
                        <span className="hidden sm:inline">쿠폰 할인가</span>
                      </dt>
                      <dd className="font-bold text-blue-600">-{formatKRW(couponDiscount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-100 pt-3">
                    <dt className="text-[15px] font-black text-[#0D1B2A]">총 결제 금액</dt>
                    <dd className="text-[18px] font-black text-[#0D1B2A]">
                      {formatKRW(payAmount)}
                    </dd>
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
      </main>
    </>
  );
}
