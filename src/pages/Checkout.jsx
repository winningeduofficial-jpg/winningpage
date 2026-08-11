import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTossPayments, ANONYMOUS } from '../lib/toss';
import { formatKRW } from '../data/pricingCatalog';
import { CHECKOUT_AGREEMENTS } from '../data/legalDocs';
import { getCart, saveCart } from '../lib/cart';

// 시안 18개 프레임 전부 '신용 /체크 카드'(슬래시 앞에만 공백)로 동일했으나,
// 문구 코퍼스 251건 중 슬래시 앞 공백 사례는 0건이었다(대조군 StudentForm.jsx:775,
// ParentForm.jsx:293 '영문/숫자/특수문자 포함 6자 이상' 도 공백 없음) — 시안 자체의
// 오식으로 판정해 사용자 승인 하에 정정함(2026-08-11).
const PAY_METHODS = [
  { key: 'tosspay', label: '토스페이', tossMethod: 'CARD' }, // 간편결제는 카드창 내에서 제공
  { key: 'card', label: '신용/체크카드', tossMethod: 'CARD' },
  { key: 'virtual', label: '가상계좌', tossMethod: 'VIRTUAL_ACCOUNT' }
];

// 아코디언 헤더 = 시안 'UI 라벨' 스케일(1920 실측 14px w500 lh20 #525252). 390 프레임에
// 이 라벨의 별도 수치가 없어 브레이크포인트를 만들지 않고 14px 한 값으로 둔다(아래 다른
// UI 라벨들도 같은 판단). 셰브론은 시안에 수치가 없어 보조 텍스트 토큰(ink.sub)을 쓴다 —
// line(#d7d7d7)은 흰 배경에서 아이콘으로 쓰기엔 너무 옅다.
// 섹션 헤딩('주문 상품 N' · '구매 전 확인사항' · '쿠폰 선택' · '결제 수단 선택' · '결제 금액').
// 시안 실측 — 390(1882:13552) 20px w600 lh26 ls-0.4 / 1920(3437:2974) 32px w600 lh45 ls-0.64.
// lh 비율만 갈린다(26/20 = 1.3, 45/32 = 1.406)라 leading 을 sm 에서 함께 올리고,
// ls 는 두 폭 모두 size × 0.02 (20×0.02 = 0.4, 32×0.02 = 0.64)라 -0.02em 한 값으로 덮인다.
// '결제 금액'만 1920 인벤토리에 개별 항목이 없지만 같은 위계의 섹션 제목이라 함께 묶었다.
// (h2/h3 태그 구분은 문서 구조라 그대로 두고 타입 스케일만 통일한다 — 시안은 셋을 같은 크기로 그린다.)
const SECTION_HEADING =
  'text-[1.25rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[2rem] sm:leading-[1.4]';

function Accordion({ title, open, onToggle, children }) {
  return (
    <div className="rounded-xl border border-line">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[0.875rem] font-medium leading-[1.25rem] text-ink"
      >
        <span>{title}</span>
        <ChevronDown size={18} className={`text-ink-sub transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-line px-4 py-3.5">{children}</div>}
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
    <div className="max-h-[7.625rem] overflow-y-auto pr-1.5 text-[0.75rem] font-normal leading-relaxed text-ink sm:max-h-[15rem]">
      {docTitle && <p className="mb-1.5 font-semibold text-ink">{docTitle}</p>}
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
            <p key={i} className="mt-2.5 font-semibold text-ink">
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
// AgreementRow(src/components/auth/AgreementRow.jsx) 를 쓰지 않은 이유(P0 접근성 보강 시
// 검토) — 구조가 이 화면과 안 맞는다: AgreementRow 는 bg-surface-card 카드 한 장에
// 체크박스+배지+라벨을 한 행으로 묶고 우측은 '상세 페이지로 이동'하는 Link 전용이다.
// 이 화면은 그 자리에서 펼치는 아코디언(Accordion, 위)이 이미 전문을 보여주므로 Link 이동은
// 안 맞고, 카드 배경·패딩도 이 화면 시안(아코디언 바로 아래 인라인 체크 행)과 다르다.
// className prop 으로 bg/padding 을 덮어써 볼 수도 있으나 Tailwind 클래스는 later-in-string
// 이 항상 이기는 게 아니라 생성 순서가 이기므로, 문자열 뒤에 이어붙이는 방식으로는 승패가
// 안정적으로 보장되지 않는다 — 다른 화면 20여 곳이 쓰는 공유 컴포넌트라 그 리스크를
// 감수하지 않고, 대신 이 컴포넌트에 접근성만 최소 보강한다(role/aria-checked, 네이티브
// button 이라 Enter/Space 키보드 지원은 이미 있다). ref 는 미충족 사유 클릭 시
// 포커스 이동(scrollToRef)에 쓴다.
const RequiredCheck = forwardRef(function RequiredCheck({ checked, onChange, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      // rounded-lg + focus:ring — 미충족 사유 클릭 시 scrollToRef 가 이 버튼으로
      // el.focus() 를 프로그램적으로 호출하는데, Chromium 은 포인터 클릭 경로의
      // 프로그램적 focus() 를 :focus-visible 로 판정하지 않는다(UA 기본 포커스
      // 링도 내부적으로 focus-visible 을 쓰므로 같이 안 보인다). 그래서 이동은
      // 되는데 어디로 이동했는지 안 보이는 문제가 생긴다. :focus-visible 이 아니라
      // :focus 에 직접 스타일을 걸어 클릭·키보드·스크립트 이동 어느 경로든 항상
      // 보이게 한다. transform 이 없는 그림자 변화라 motion-reduce 가드는 불필요.
      className="mt-2.5 flex items-center gap-2 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${
          checked ? 'border-primary bg-primary' : 'border-line bg-white'
        }`}
      >
        {checked && <Check size={12} strokeWidth={3.5} className="text-white" />}
      </span>
      {/* '필수' 와 확인 문구는 시안에서 서로 다른 스타일이라 한 span 으로 묶지 않는다.
          · 필수 — 390 실측 12px w500 #013262, 1920 은 두 곳의 색이 갈린다(#191d23 / #013262).
            #191d23 은 토큰이 없어 가장 근접한 ink.title(#181d24)이 되겠지만, 같은 화면 안
            두 배지가 다른 색인 건 시안 쪽 흔들림으로 보고 390 과 일치하고 토큰 주석이
            "'필수' 라벨"로 지목한 primary(#013262) 하나로 통일했다.
          · 확인 문구 — 1920 실측 14px w400 lh20 #808080(= ink.sub). 390 수치가 없어 한 값. */}
      {/* 간격은 부모 button 의 gap-2(8px)가 낸다 — 시안 1280 프레임(1882-13399) 실측
          체크박스 우단 12 → '필수' x=20 이 정확히 8px 다. 별도 mr 를 얹지 않는다. */}
      <span className="text-[0.75rem] font-medium leading-[1.25rem] text-primary sm:text-[0.875rem]">
        필수
      </span>
      <span className="text-[0.875rem] font-normal leading-[1.25rem] text-ink-sub">{children}</span>
    </button>
  );
});

// c.code 는 fn_usable_coupons/fn_coupon_by_code 둘 다 더 이상 반환하지 않는다
// (DB 하드닝, P1-1 — 무인증 전체 코드 덤프 방지). 두 RPC의 반환 컬럼이 동일해
// 쿠폰 객체 형태를 여기 한 곳에서만 정의하고 fetchCoupons(목록 조회)와
// applyCouponCode(코드 조회) 양쪽이 공유한다.
function mapCouponRow(c) {
  return {
    id: c.id,
    title: c.title,
    discount: c.discount_amount,
    minAmount: c.min_amount || 0,
    validUntil: c.valid_until,
    isActive: c.is_active,
    eligible: c.eligible,
    // reason: below_min_amount | expired | already_used | inactive |
    // login_required | sold_out | not_granted | null. 한국어 문구는 아래
    // COUPON_REASON_TEXT 를 그대로 쓴다.
    reason: c.reason
  };
}

// 신규 쿠폰 하드닝(P0-2/P1-3/P1-7/P1-8)으로 새로 생긴 사용자 안내 자리다.
// 문구는 팀 리드가 승인한 코퍼스 규범 문자열이다(2026-08-11).
const COUPON_REASON_TEXT = {
  below_min_amount: '최소 결제 금액에 미치지 않습니다.',
  expired: '사용 기한이 지났습니다.',
  already_used: '이미 사용한 쿠폰입니다.',
  inactive: '사용할 수 없는 쿠폰입니다.', // (코드로 정확히 맞힌 경우에만 도달)
  login_required: '로그인 후 사용할 수 있습니다.',
  sold_out: '발급 수량이 모두 소진되었습니다.',
  // 2026-08-11 발급형 쿠폰(coupons.grant_type='granted') 도입으로 늘어난 사유.
  // 로그인은 돼 있는데 이 쿠폰을 발급받지 않은 상태다(sql/55 2-c절).
  not_granted: '발급받지 않은 쿠폰입니다.'
};

// handlePay 의 표시가/청구가 불일치 안내(아래 amountMismatch).
const AMOUNT_MISMATCH_TEXT = '결제 금액이 변경되었습니다. 쿠폰 적용 내용을 다시 확인해 주세요.';

// applyCouponCode 에서 코드 자체를 못 찾았을 때. 이건 신규 문구가 아니라
// 기존 코퍼스 문구를 그대로 재사용한다 — 예전엔 window.alert 로 띄우던 것을
// 인라인 표시로 옮겼을 뿐이다(window.alert 는 이 프로젝트에서 이미 결함으로
// 지적된 패턴).
const CODE_NOT_FOUND_TEXT = '유효하지 않은 쿠폰 코드입니다.';

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
  // 코드 입력 피드백 — '코드 자체가 없음'과 '코드는 맞지만 지금 조건 미충족'을
  // 구분해서 보여준다(과거엔 후자도 "유효하지 않은 쿠폰 코드입니다"로 뭉뚱그려
  // 거짓 안내였다 — applyCouponCode 참고). type: 'not_found' | 'ineligible'.
  const [codeFeedback, setCodeFeedback] = useState(null);
  // 표시가(payAmount)와 서버 청구가(order.amount)가 다를 때 세팅한다 — 서버가
  // 쿠폰 일부를 조용히 스킵한 경우(로그인 필요/전체 소진/비결합 배제/0원 방지
  // 등). handlePay 참고.
  const [amountMismatch, setAmountMismatch] = useState(false);

  const [payMethod, setPayMethod] = useState('card');
  const [openNotice, setOpenNotice] = useState(false);
  const [openTerms, setOpenTerms] = useState(false);
  const [agreeNotice, setAgreeNotice] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  // CTA 미충족 사유 클릭 시 스크롤+포커스 이동 대상. '전체 선택' 토글은 네이티브 button
  // 이라 포커스가 되는 기존 요소를 그대로 재사용한다(상품 목록 자체엔 포커스 가능한
  // 단일 지점이 없다).
  const toggleAllRef = useRef(null);
  const noticeCheckRef = useRef(null);
  const termsCheckRef = useRef(null);

  function scrollToRef(ref) {
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }

  const checkedItems = useMemo(
    () => items.filter((i) => checkedIds.has(i.id)),
    [items, checkedIds]
  );
  const allChecked = items.length > 0 && checkedIds.size === items.length;

  // 금액 계산
  const listTotal = checkedItems.reduce((s, i) => s + Number(i.listPrice || i.price || 0), 0);
  const subtotal = checkedItems.reduce((s, i) => s + Number(i.price || 0), 0);
  const productDiscount = listTotal - subtotal;

  // 쿠폰 목록 로드. 판정(활성/기간/최소금액/사용 횟수 제한/로그인 필요/전체
  // 소진)은 전부 DB 함수 fn_usable_coupons 가 전담한다(sql/55_coupon_policy.sql)
  // — 클라이언트는 today 를 계산하지 않는다(예전엔 시계 조작으로 만료 쿠폰이
  // 되살아났고, UTC 계산이라 KST 자정~09시 구멍도 있었다). 최소금액 조건이
  // subtotal 에 달려 있으므로 subtotal 이 바뀔 때마다(상품 체크 토글) 다시
  // 불러 eligible 을 최신 상태로 유지한다. 쿠폰은 선택 요소라 조회 실패 시에도
  // 결제 자체는 막지 않되, 실패를 조용히 삼키지 않고 콘솔 경고 + 쿠폰 영역
  // 안내로 노출한다. handlePay(표시가/청구가 불일치 시)도 이 함수를 다시 불러
  // 화면을 최신 판정으로 갱신한다 — signalAlive 는 그 수동 호출 경로에서는
  // 안 쓰인다(중복 호출로 서로를 취소할 stale-response 걱정이 없는 1회성
  // 사용자 액션이라서다).
  const fetchCoupons = useCallback(async ({ signalAlive } = {}) => {
    const { data, error } = await supabase.rpc('fn_usable_coupons', { p_subtotal: subtotal });
    if (signalAlive && !signalAlive()) return;
    setCouponsLoaded(true);
    if (error) {
      console.warn('쿠폰 조회 실패:', error.message);
      setCouponError(true);
      return;
    }
    setCouponError(false);
    setCoupons((data || []).map(mapCouponRow));
  }, [subtotal]);

  useEffect(() => {
    let alive = true;
    fetchCoupons({ signalAlive: () => alive });
    return () => {
      alive = false;
    };
  }, [fetchCoupons]);

  // 판매 종료(비활성) 쿠폰은 고객에게 노출할 이유가 없어 목록에서 숨긴다.
  // fn_usable_coupons 는 이제 is_active=false 행 자체를 제외하고 반환하므로
  // (sql/55_coupon_policy.sql 3-a 주석) 이 필터는 사실상 fetchCoupons 결과에는
  // 항상 no-op 이다 — 실제로 걸리는 경우는 applyCouponCode 가 코드로 정확히
  // 맞혀 coupons 에 병합한 비활성 쿠폰뿐이다(fn_coupon_by_code 는 is_active
  // 와 무관하게 반환한다, sql/55 3-b 주석). applyCouponCode 는 정직성을 위해
  // 이 필터 이전의 전체 목록(coupons)을 쓴다.
  const visibleCoupons = useMemo(() => coupons.filter((c) => c.isActive), [coupons]);

  // 선택된 쿠폰 중 DB가 eligible=true 로 판정한 것만 적용, 총 할인은 subtotal 초과 불가.
  // (최소금액/기간/사용 횟수 판정을 여기서 다시 하지 않는다 — DB 판정을 그대로 신뢰한다.)
  const couponDiscount = useMemo(() => {
    let sum = 0;
    coupons.forEach((c) => {
      if (selectedCouponIds.has(c.id) && c.eligible) sum += Number(c.discount || 0);
    });
    return Math.min(sum, subtotal);
  }, [coupons, selectedCouponIds, subtotal]);

  const discountTotal = productDiscount + couponDiscount;
  const payAmount = Math.max(0, listTotal - discountTotal);

  const canPay = checkedItems.length > 0 && agreeNotice && agreeTerms && !loading;

  // CTA 비활성 사유. loading 은 결제 진행 중인 정상 상태(사유가 아니다)라 제외한다.
  // 순서는 화면에서 위→아래로 만나는 순서(상품 선택 → 안내사항 → 약관)와 맞췄다.
  const unmetReasons = useMemo(() => {
    const reasons = [];
    if (checkedItems.length === 0) {
      reasons.push({
        key: 'items',
        text: '결제할 상품을 선택해 주세요.',
        onClick: () => scrollToRef(toggleAllRef)
      });
    }
    if (!agreeNotice) {
      reasons.push({
        key: 'notice',
        text: '구매 전 안내사항 확인이 필요합니다.',
        onClick: () => scrollToRef(noticeCheckRef)
      });
    }
    if (!agreeTerms) {
      reasons.push({
        key: 'terms',
        text: '결제 약관 동의가 필요합니다.',
        onClick: () => scrollToRef(termsCheckRef)
      });
    }
    return reasons;
  }, [checkedItems.length, agreeNotice, agreeTerms]);

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
    setAmountMismatch(false);
    setSelectedCouponIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 부적격이어도 거짓말하지 않는다 — 예전엔 "로드된(=활성+미만료) 목록"에서만
  // 찾아, over40k-3000 같은 실제 유효 코드에도 "유효하지 않은 쿠폰
  // 코드입니다"라고 안내했다(밸리데이션 버그이지 코드 문제가 아니었다).
  // fn_usable_coupons 가 code 를 반환하지 않게 되면서(P1-1) 목록에서 찾는
  // 방식 자체가 성립하지 않는다 — 입력한 코드를 fn_coupon_by_code 로 직접
  // 조회한다. 0행 = 코드 자체가 없다("코드 문제"). 1행인데 eligible=false =
  // 코드는 맞지만 지금 조건 미충족("조건 문제") — 서로 다른 사실이라
  // codeFeedback 으로 구분해서 알린다(렌더 쪽 COUPON_REASON_TEXT 주석 참고).
  async function applyCouponCode() {
    const code = couponCode.trim();
    if (!code) return;

    const { data, error } = await supabase.rpc('fn_coupon_by_code', {
      p_code: code,
      p_subtotal: subtotal
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

    // 찾았지만 지금은 못 쓰는 쿠폰(최소금액 미달/기간 만료/이미 사용/판매
    // 종료/로그인 필요/전체 소진)이어도 선택 상태·목록에는 넣는다 — 목록에
    // 나타나면 기존 비활성 스타일(opacity-45, disabled)로 "코드는 인식됐지만
    // 지금은 조건 미충족"임을 보여준다. 단 판매 종료(isActive=false) 쿠폰은
    // visibleCoupons 에서 아예 숨기므로 선택해도 카드가 드러나지 않는다 —
    // 그 경우의 사용자 피드백은 codeFeedback(아래)이 대신 맡는다.
    setCoupons((prev) => [...prev.filter((c) => c.id !== found.id), mapCouponRow(found)]);
    setSelectedCouponIds((prev) => new Set(prev).add(found.id));
    setAmountMismatch(false);
    setCodeFeedback(found.eligible ? null : { type: 'ineligible', reason: found.reason });
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
        window.alert(order?.error || '주문 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        setLoading(false);
        return;
      }

      // 표시가/청구가 대조 — 서버가 재계산한 order.amount 가 화면이 보여준
      // payAmount 와 다르면(로그인 필요/전체 소진/비결합 배제/0원 방지 등으로
      // 서버가 쿠폰 일부를 조용히 스킵한 경우) 사용자가 토스 결제창에서 처음
      // 보는 금액으로 결제하게 둘 수 없다. requestPayment 를 호출하지 않고
      // 중단하고, 실제로 적용된 쿠폰만 선택에 남긴 뒤 목록을 다시 불러 화면을
      // 최신 판정으로 갱신한다. 이미 생성된 pending 주문은 그대로 둔다 —
      // 취소 API가 없어(이번 작업 범위 밖) 30분 소프트 홀드로 자연 만료된다
      // (sql/55_coupon_policy.sql fn_coupon_is_redeemed 의 pending+30분 규칙).
      if (Number(order.amount) !== payAmount) {
        const appliedIds = new Set(order.appliedCouponIds || []);
        const droppedIds = Array.from(selectedCouponIds).filter((id) => !appliedIds.has(id));
        console.warn('결제 금액 불일치 — 서버가 스킵한 쿠폰:', droppedIds);
        setSelectedCouponIds(appliedIds);
        setAmountMismatch(true);
        await fetchCoupons();
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
        {/* 빈 장바구니는 시안에 없다. 주문서 H1(390 32 / 1920 50)을 그대로 쓰면 카드 없는
            센터 레이아웃에서 과하게 크므로, 사이트 지배 헤딩인 섹션 H2 스케일
            (랜딩 실측 32px w600 lh45, 390 은 24px)로 한 단 낮춰 결제 실패 화면과 형제로 맞췄다.
            본문·CTA 는 주문서의 상품설명문(16px w400)·CTA(14/20 w600) 스케일 재사용. */}
        <main className="flex min-h-screen flex-col items-center justify-center bg-white pt-16 text-center">
          <h1 className="text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink sm:text-[2rem]">
            선택한 상품이 없습니다
          </h1>
          <p className="mt-3 text-[0.875rem] font-normal leading-[1.375rem] text-ink sm:text-[1rem]">
            결제할 서비스를 먼저 선택해 주세요.
          </p>
          <Link
            to="/pricing"
            className="mt-8 rounded-xl bg-primary px-8 py-3.5 text-[0.875rem] font-semibold leading-[1.25rem] text-white transition hover:brightness-125"
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
        {/* 주문서 콘텐츠 폭 — 프로젝트 공통 관용구 `mx-auto w-full max-w-content px-5 sm:px-8`
            (정의: components/landing/NewsSection.jsx:13 주석, tailwind.config.js:6-11).
            max-w 는 box-sizing:border-box 기준 outer 라서 max-w-content = 72.75rem = 1164px
            에서 sm 이상 px-8(32×2 = 64px)을 빼면 실제 콘텐츠 폭 1164 − 64 = 1100px 이다.
            Header.jsx:683(좌표계 2 = nav·메가 컬럼) · SiteFooter.jsx:64(lg+ 브랜치)가 같은
            토큰 + px-8 이라 주문서 좌단이 그 둘과 정확히 일치한다 — 실측 콘텐츠 좌단
            1920 → 410 / 1440 → 170 / 1280 → 90 / 768 → 32 / 390 → 20 이 헤더 nav·푸터 lg 좌단과
            동일했다(Pricing.jsx 의 같은 컨테이너 주석에 정렬 예외 두 건 정리해 뒀다 — 헤더
            로고는 좌표계 1(120rem 밴드), 푸터 모바일 브랜치는 px-6).
            시안 1920 프레임의 콘텐츠 1518px 은 채택하지 않는다
            (사용자 확정: 결제 화면도 전역 컨텐츠 영역 규약을 따른다).
            폭별 inner = min(뷰포트 − 64, 1100): 1920/1440/1280 → 1100, 768 → 704.
            sm 미만은 상한(1164)에 걸리지 않으므로 px-5(20×2 = 40px)가 폭을 정한다 → 390 → 350. */}
        <div className="mx-auto w-full max-w-content px-5 py-14 sm:px-8">
          {/* H1 — 시안 실측 390(1882:13552) 32px w600 lh45 ls-0.64, 1920(3437:2974) 50px w600
              lh70 ls-1. 두 값 모두 lh/size ≈ 1.4(44.8/45, 70/70)이고 ls = size × -0.02em
              (32×0.02=0.64, 50×0.02=1.0)이라 leading/tracking 은 비율 한 벌로 덮인다.
              색은 #525252 = ink 다(ink.title 이 아니다). 무게는 w900 → w600. */}
          <h1 className="mb-12 text-[2rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink sm:text-[3.125rem]">
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
              효과는 0px 다).
              ※ 아래 수치는 시안 타이포 정렬(쿠폰 제목 13.5px w700 → base 12px w500 / sm 14px w500,
                 금액 13.5px w900 → base 12px w500)에 맞춰 전부 재실측한 값이다. 폰트가 작아져
                 하한도 함께 내려갔으므로 예전 290.28/289.98/123.01/167.27/47.01 은 폐기됐다.
              layout 320(뷰포트 330)에서 제목을 최장값 '학기 초 얼리버드 특별 할인 쿠폰'(16자)으로
              바꿔 실측 → 트랙 하한 = 32(px-4 좌우) + 2(border 1px 좌우) + 18(체크박스) + 12(gap)
              + 149.48(제목 nowrap) + 12(gap) + 37.18(금액 min-content) = 262.66px,
              width:min-content 실측 262.66px 로 잔차 0.
              · 149.48 은 위 최장 제목 기준(base 12px w500)이고 제목이 1px 늘면 하한도 1px 늘어난다
                ('하한 − 제목 nowrap' = 32+2+18+12+12+37.18 = 113.18 고정).
              · 37.18 은 '-2,000원'의 max-content 47.55 가 아니라 min-content 다. 금액 span 은
                nowrap 이 아니어서(shrink-0 는 내재 크기와 무관) CJK 줄바꿈 기회가 살아 있고
                '원' 앞에서 끊긴 '-2,000' 이 최소 기여다 — max-content 를 넣으면 하한을
                47.55 − 37.18 = 10.37px 과대평가한다.
              · 위 값들은 실행 중인 앱(동일 Tailwind 빌드 · Pretendard Variable)의 실제 /checkout
                쿠폰 행을 측정한 것이다. 시안 수치가 아니다.
              전역 규약(px-5, 좌우 20px)에서 sm 미만 inner = W − 40 이므로 320 → 280,
              330 → 290, 390 → 350 이다(실측 확인). 타이포를 시안 값으로 내린 뒤에는 하한
              262.66 < inner 280 이라 320 에서도 잠식이 사라졌다(grid-cols-1 을 떼도 트랙 280 ·
              문서 폭 320 으로 실측 동일, grid-cols-1 이면 트랙 = inner = 280).
              즉 지금은 여유 구간이지만 방어는 유지한다 — 하한은 제목 길이에 1:1로 붙고 390 기준
              여유가 350 − 262.66 = 87.34px 뿐이어서, 제목이 그만큼 길어지면 트랙이 다시 inner 를
              무시하고 우패딩(20px)을 잠식한다. index.css:38 의
              min-width:min(320px,100%) 가 320 을 지원 폭으로 명시해 둔 상태다.
              grid-cols-1 = repeat(1,minmax(0,1fr)) 이라 트랙 하한이 0 이 되어 트랙 = inner 로
              풀리고 truncate 가 의도대로 작동한다. desktop 쪽 1fr → minmax(0,1fr) 도 같은
              방어다(1fr = minmax(auto,1fr) 이라 min-content 하한이 그대로 붙는다. 지금은 좌
              컬럼 652 가 카드 min-content 248.71 을 크게 웃돌아 무해하지만, nowrap 콘텐츠가
              늘면 같은 사고다. 248.71 은 상품명을 시안 값(sm 24px w500)으로 올린 뒤 재실측한
              값이다 — 예전 206.8 은 상품명 15px w700 기준이라 폐기).
              25rem = 400px 로 우 컬럼 폭은 불변, 프로젝트 단위 규칙(rem)에 맞춘 환산이다.

              전역 컨텐츠 규약을 쓰면 desktop(1440) 이상에서 inner 가 1100 으로 고정되므로
              좌 컬럼은 폭에 무관하게 1100 − 48(gap-12) − 400 = 652px 로 일정하다(1440·1512·
              1920 전부 동일). 시안 1920 의 좌 1070 은 콘텐츠 1518 전제(1518−48−400)라 함께
              폐기된 값이다.
              652 는 1280 시안이 폼에 쓰는 570 보다 넓고 카드 min-content 248.71 의 2.6배라
              좁아서 깨지는 폭이 아니므로 2컬럼 전환점은 desktop 그대로 둔다 — 이 전환점은
              컨테이너 폭과 무관한 별건이고, 헤더 GNB 가 인라인으로 바뀌는 시점(desktop 90rem)과
              레이아웃 전환을 일치시킨다는 근거로 선택된 값이다(시안 1280 프레임 = 1컬럼 만족). */}
          <div className="grid grid-cols-1 gap-12 desktop:grid-cols-[minmax(0,1fr)_25rem]">
            {/* 좌측: 주문 상품 */}
            <section>
              <h2 className={`mb-5 ${SECTION_HEADING}`}>주문 상품 {items.length}</h2>

              <button
                ref={toggleAllRef}
                type="button"
                onClick={toggleAll}
                // focus: 링 사유는 RequiredCheck 주석 참고 — 이 버튼도 미충족 사유
                // 클릭(scrollToRef)의 이동 대상이라 같은 문제를 겪는다.
                className="mb-4 flex items-center gap-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <span
                  className={`flex h-[20px] w-[20px] items-center justify-center rounded-[6px] border transition ${
                    allChecked ? 'border-primary bg-primary' : 'border-line bg-white'
                  }`}
                >
                  {allChecked && <Check size={13} strokeWidth={3.5} className="text-white" />}
                </span>
                {/* 시안 실측 — 390 12px w500 lh20 #525252(ls 없음) / 1920 20px w500 lh28 ls-0.4.
                    390 에는 ls 가 없어 tracking 을 sm 에서만 준다. lh 는 20 → 1.25rem,
                    28 → 1.75rem 로 정확히 떨어지므로 비율 대신 rem 임의값을 쓴다. */}
                <span className="text-[0.75rem] font-medium leading-[1.25rem] text-ink sm:text-[1.25rem] sm:leading-[1.75rem] sm:tracking-[-0.02em]">
                  전체 선택
                </span>
              </button>

              <div className="space-y-3">
                {items.map((item) => {
                  const isChecked = checkedIds.has(item.id);
                  const hasDiscount = Number(item.listPrice) > Number(item.price);
                  return (
                    <div
                      key={item.id}
                      className="flex gap-3 rounded-2xl border border-line p-5"
                    >
                      <button
                        type="button"
                        onClick={() => toggleItem(item.id)}
                        className="mt-0.5 shrink-0"
                      >
                        <span
                          className={`flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border transition ${
                            isChecked ? 'border-primary bg-primary' : 'border-line bg-white'
                          }`}
                        >
                          {isChecked && (
                            <Check size={14} strokeWidth={3.5} className="text-white" />
                          )}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          {/* 상품명 — 시안 실측 390 14px w500 lh18 ls-0.28 / 1920 24px w500 lh31
                              ls-0.48. lh/size 가 양쪽 모두 ≈1.3(18.2/18, 31.2/31)이고
                              ls = size × -0.02em 이라 leading·tracking 은 한 벌로 덮인다. */}
                          <p className="text-[0.875rem] font-medium leading-[1.3] tracking-[-0.02em] text-ink sm:text-[1.5rem]">
                            {item.name}
                          </p>
                          <div className="flex shrink-0 flex-col items-end">
                            {/* 정가 취소선 — 390 12px w500 lh20 #d7d7d7 ls-0.24 /
                                1920 20px w400 lh28 #d9d9d9 ls-0.4. #d9d9d9 는 토큰이 없어
                                가장 근접한 line(#d7d7d7, 오차 2/255)으로 통일했다(390 은 정확히 이 값).
                                무게만 390 w500 → 1920 w400 로 갈려 sm 에서 되돌린다. */}
                            {hasDiscount && (
                              <span className="text-[0.75rem] font-medium leading-[1.25rem] tracking-[-0.02em] text-line line-through sm:text-[1.25rem] sm:font-normal sm:leading-[1.75rem]">
                                {formatKRW(item.listPrice)}
                              </span>
                            )}
                            <span className="flex items-center gap-2">
                              {/* 할인 배지 — 1920 은 별도 노드로 20px w500 #013262 지만,
                                  390 은 '약 8%할인 55,000원' 이 금액과 한 텍스트 노드라
                                  13px w500 #525252 로 금액과 같은 색이다. 그 차이를 그대로 옮긴다.
                                  (390 13px lh20 = 1.25rem, 1920 20px lh28 = 1.75rem) */}
                              {item.badge && (
                                <span className="text-[0.8125rem] font-medium leading-[1.25rem] tracking-[-0.02em] text-ink sm:text-[1.25rem] sm:leading-[1.75rem] sm:text-primary">
                                  {item.badge}
                                </span>
                              )}
                              <span className="text-[0.8125rem] font-medium leading-[1.25rem] tracking-[-0.02em] text-ink sm:text-[1.25rem] sm:leading-[1.75rem]">
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
                          <p className="mt-2 hidden text-[1rem] font-normal leading-[1.375rem] text-ink-sub sm:block">
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
                  // 390 실측 12px w500 #013262. 1920 개별 수치는 없어 그 폭의 UI 라벨 기본값
                  // 14px 로 올린다. 밑줄은 시안 근거가 없지만 링크형 affordance 라 유지.
                  className="mt-4 text-[0.75rem] font-medium leading-[1.25rem] text-primary underline underline-offset-4 transition hover:brightness-125 sm:text-[0.875rem]"
                >
                  선택 삭제
                </button>
              )}
            </section>

            {/* 우측: 확인/쿠폰/결제수단/금액.
                desktop 미만에서는 주문상품 아래로 내려와 1컬럼이 되는데, 그때 본문 콘텐츠 폭
                (1컬럼 구간의 최대치는 전역 규약 상한인 inner 1100 = 1164~1439 구간) 전체로
                늘어나면 폼이 과도하게 넓어진다. 시안 1280 프레임의 하단 스택 폭 570px
                ÷16 = 35.625rem을 상한으로 걸고 가운데 정렬한다(시안도 888 안에서 좌우 인셋 159로
                중앙 배치). 전역 규약으로 바꾼 뒤에도 이 상한은 유지가 맞다고 판단했다 —
                최악(inner 1100)에서 좌우 인셋이 (1100−570)/2 = 265px 로 시안의 159 보다 넓어지지만
                중앙 정렬이라 헤더·푸터 좌단 정렬은 애초에 이 스택의 기준이 아니고, 상한을 풀면
                폼 입력줄이 1100px 로 늘어나 가독성이 더 나빠진다. desktop에서는 그리드 2번째
                컬럼이 25rem(=400px)이라 이 상한은 걸리지 않는다. */}
            <aside className="mx-auto w-full max-w-[35.625rem] space-y-10">
              {/* 섹션 순서(P0 접근성 수정) — 원래는 '구매 전 확인사항' → 쿠폰 선택 → '결제 수단
                  선택'(그 안에 결제 약관 동의가 끼어 있었다) → 결제 금액 이었다. 두 필수 동의가
                  쿠폰 블록을 사이에 두고 떨어져 있어, 모바일 1컬럼에서 안내사항 하나만 체크하고
                  '다 했다'고 착각하기 쉬웠다(아래로 스크롤하다 결제수단 섹션 안에 있는 두 번째
                  동의를 못 보고 지나침). 그래서 필수 동의가 아닌 '결제 수단 선택'·'쿠폰 선택'을
                  앞으로 옮기고, 두 필수 동의(구매 전 확인사항 → 결제 약관 동의)를 서로 인접시켜
                  결제 금액/CTA 바로 앞에 배치했다. 각 섹션의 내부 구조·문구·아코디언은 시안
                  실측값을 그대로 유지했다 — 바뀐 건 블록 순서뿐이다. */}

              {/* 결제 수단 선택 */}
              <div>
                <h3 className={`mb-4 ${SECTION_HEADING}`}>결제 수단 선택</h3>
                {/* 390 시안(1882-11814 등 6장)은 결제수단 버튼을 세로 1열, 폭 160px(=10rem)
                    가운데 정렬로 그린다. 1280 시안은 3열(실측 184.67px×3 + gap 8)이다.
                    시안 BP가 390/1280/1920뿐이라 전환점 sm(640)은 보간 판단값이다. */}
                <div className="mx-auto grid max-w-[10rem] grid-cols-1 gap-2 sm:max-w-none sm:grid-cols-3">
                  {PAY_METHODS.map((m) => (
                    <button
                      type="button"
                      key={m.key}
                      onClick={() => setPayMethod(m.key)}
                      // 시안 실측 — 선택 14px w500 #013262, 미선택 1920 #808080 / 390 #7a7a7a.
                      // #7a7a7a 는 토큰이 없어 가장 근접한 ink.sub(#808080, 오차 6/255)로
                      // 통일했다(1920 은 정확히 이 값). 두 폭 모두 14px 라 크기 분기는 없다.
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

              {/* 쿠폰 선택 */}
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
                    // placeholder 는 시안 실측 14px w500 #d9d9d9 → 토큰 line(#d7d7d7).
                    // 입력값 색은 토큰 주석이 지정한 본문/입력값 기본 ink(#525252).
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

                {/* 코드 입력 피드백 — '코드 자체가 없음'(기존 코퍼스 문구 재사용)과
                    '코드는 맞지만 조건 미충족'(COUPON_REASON_TEXT)을 구분한다.
                    COUPON_REASON_TEXT[reason] 가드는 문구 대기용이 아니라, reason 이
                    7종 키 밖의 예상 밖 값일 때(undefined) 아무것도 그리지 않기 위한
                    것이다. applyCouponCode 참고. */}
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

                {/* 쿠폰 0장 빈 상태. 시안에 없는 문구지만, 시드 쿠폰이 만료되면 0장이 기본
                    화면이 되는데 아무것도 렌더하지 않으면 코드 입력칸만 남아 쿠폰 영역이
                    고장난 것처럼 보인다 — 그 실제 결함을 막기 위해 남긴다.
                    용어는 시안 정본인 '보유 쿠폰 N장'(덤프 18/18 프레임)에 맞춰 '보유한'으로
                    통일했다. 조회 실패는 위 couponError 가 이미 안내하므로 겹쳐 쓰지 않는다. */}
                {couponsLoaded && !couponError && visibleCoupons.length === 0 && (
                  <p className="mt-5 text-[0.875rem] font-normal leading-[1.25rem] text-ink-sub">
                    보유한 쿠폰이 없습니다.
                  </p>
                )}

                {visibleCoupons.length > 0 && (
                  <>
                    {/* 시안 정본 문구 — 덤프 18개 프레임 전부 '보유 쿠폰 2장'. */}
                    {/* 시안 실측 14px w400 lh20 #525252 — '쿠폰 사용 안함' 과 같은 스타일. */}
                    <p className="mb-2 mt-5 text-[0.875rem] font-normal leading-[1.25rem] text-ink">
                      보유 쿠폰 {visibleCoupons.length}장
                    </p>
                    <div className="space-y-2">
                      {visibleCoupons.map((c) => {
                        // eligible/reason 은 fn_usable_coupons(DB) 판정을 그대로 쓴다 —
                        // 최소금액뿐 아니라 기간 만료·쿠폰별 사용 횟수 제한까지 여기 반영된다
                        // (subtotal >= minAmount 로직을 클라이언트에서 재계산하지 않는다).
                        const eligible = c.eligible;
                        const isSelected = selectedCouponIds.has(c.id);
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
                              {isSelected && (
                                <Check size={12} strokeWidth={3.5} className="text-white" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              {/* 쿠폰명 — 390 실측 '회원가입 특별할인' 12px w500 lh20 #525252,
                                  1920 은 그 폭의 UI 라벨 기본값 14px w500 lh20 #525252. */}
                              <span className="block truncate text-[0.75rem] font-medium leading-[1.25rem] text-ink sm:text-[0.875rem]">
                                {c.title}
                              </span>
                              {/* 만료일 — 시안 실측 12px w400 #808080. lh 값이 없어 사이트 기본
                                  비율 1.4 를 쓴다(16.8px — 2줄 블록을 조밀하게 유지). */}
                              {c.validUntil && (
                                <span className="block text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
                                  {String(c.validUntil).replace(/-/g, '.')}까지
                                </span>
                              )}
                              {/* 부적격 사유 캡션 — login_required/sold_out 포함 7종 reason 전부
                                  이 한 자리로 모인다(opacity-45+disabled 는 이미 eligible 하나로
                                  전 사유를 동일하게 처리한다 — 새 사유가 늘어도 그 처리는
                                  자동으로 적용된다). COUPON_REASON_TEXT[reason] 가드는 reason 이
                                  예상 밖 값일 때(undefined) 아무것도 그리지 않기 위한 것이다. */}
                              {!eligible && COUPON_REASON_TEXT[c.reason] && (
                                <span className="block text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
                                  {COUPON_REASON_TEXT[c.reason]}
                                </span>
                              )}
                            </span>
                            {/* 시안(1882-10111·3437-2974 등)은 '-6,000원'처럼 단위까지 붙는다.
                                이 파일의 다른 금액과 동일하게 formatKRW를 경유시킨다. */}
                            {/* 할인액에는 시안 개별 수치가 없다. 크기는 이 폭의 UI 라벨 기본값
                                (390 12 / 1920 14, w500 lh20), 색은 토큰 주석이 '강조·할인' 으로
                                지정한 primary(#013262)를 쓴다 — 아래 결제금액 할인 행과 같다. */}
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
                        // 시안 실측 14px w400 lh20 #525252 ('보유 쿠폰 N장' 과 같은 스타일).
                        // hover 는 ink-title(#181d24)을 쓰고 있었으나 그 토큰은 시안이 로그인 H1
                        // 에서만 쓰는 색이라 근거가 없다. 기본 상태(text-ink)는 시안과 일치하므로
                        // 건드리지 않고, hover 만 이 파일의 다른 링크형 요소('선택 삭제' 등)와 같은
                        // brightness 필터 방식으로 바꿨다(밝은 배경이라 어둡게 = brightness-90).
                        className="text-[0.875rem] font-normal leading-[1.25rem] text-ink underline underline-offset-4 transition hover:brightness-90"
                      >
                        쿠폰 사용 안함
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 구매 전 확인사항 — 필수 동의 1/2. 결제 약관 동의(아래)와 인접·CTA 직전에
                  두기 위해 원래 위치(쿠폰 선택보다 앞)에서 이 자리로 옮겼다(위 순서 주석). */}
              <div>
                <h3 className={`mb-4 ${SECTION_HEADING}`}>구매 전 확인사항</h3>
                <Accordion
                  title="[구매 전 안내사항]"
                  open={openNotice}
                  onToggle={() => setOpenNotice((v) => !v)}
                >
                  <AgreementText text={CHECKOUT_AGREEMENTS.purchaseNotice} />
                </Accordion>
                {/* 두 필수 동의 문구가 '위 내용을 모두 확인하였습니다.'로 글자까지 동일해
                    어느 걸 체크했는지 구분이 안 됐다. 지칭 대상(안내사항/약관)을 문구에
                    직접 넣어 구별한다. */}
                <RequiredCheck
                  ref={noticeCheckRef}
                  checked={agreeNotice}
                  onChange={() => setAgreeNotice((v) => !v)}
                >
                  위 안내사항을 확인하였습니다.
                </RequiredCheck>
              </div>

              {/* 결제 약관 동의 — 필수 동의 2/2. 원래 '결제 수단 선택' 섹션 안에 끼어 있어
                  (그 섹션은 필수가 아니다) 구매 전 확인사항과 멀리 떨어져 있었다. 섹션을
                  분리해 이름을 명시하고 위 확인사항 바로 아래로 옮겼다. 아코디언 문구·본문은
                  기존 그대로다. */}
              <div>
                <h3 className={`mb-4 ${SECTION_HEADING}`}>결제 약관 동의</h3>
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
                <RequiredCheck
                  ref={termsCheckRef}
                  checked={agreeTerms}
                  onChange={() => setAgreeTerms((v) => !v)}
                >
                  위 약관에 동의합니다.
                </RequiredCheck>
              </div>

              {/* 결제 금액 */}
              <div>
                <h3 className={`mb-4 ${SECTION_HEADING}`}>결제 금액</h3>
                {/* 금액 행 라벨·값은 시안 'UI 라벨' 스케일 14px w500 lh20 #525252 로 통일한다.
                    할인 행의 값만 토큰 주석이 '강조·할인' 으로 지정한 primary 를 쓴다. */}
                <dl className="space-y-3 text-[0.875rem] font-medium leading-[1.25rem] text-ink">
                  <div className="flex justify-between">
                    <dt>판매가</dt>
                    <dd>{formatKRW(listTotal)}</dd>
                  </div>
                  {/* 시안 3437-2974(쿠폰 적용 상태)는 '할인가'(상품할인)와 '쿠폰 할인가'를 별도 행으로
                      나눈다. 합계 로직(discountTotal·payAmount)은 그대로라 총액은 불변이다.
                      쿠폰 미적용 base 프레임(1882-10111)에는 쿠폰 행이 없으므로 0원일 때 숨긴다. */}
                  <div className="flex justify-between">
                    <dt>할인 금액</dt>
                    <dd className="text-primary">
                      {productDiscount > 0 ? `-${formatKRW(productDiscount)}` : formatKRW(0)}
                    </dd>
                  </div>
                  {couponDiscount > 0 && (
                    <div className="flex justify-between">
                      {/* 라벨 정본 통일 — 이전엔 BP마다 '쿠폰할인가'(390)/'쿠폰 할인가'(1280·1920)로
                          갈려 있었다. '할인가'(단가)와 혼동을 피하려 '쿠폰 할인 금액'(액수)으로
                          통일하며 BP 분기도 함께 제거했다. */}
                      <dt>쿠폰 할인 금액</dt>
                      <dd className="text-primary">-{formatKRW(couponDiscount)}</dd>
                    </div>
                  )}
                  {/* 합계 행은 시안 인벤토리에 개별 수치가 없다. 위 금액 행(14px w500)보다
                      한 단 위, 섹션 헤딩(390 20 / 1920 32)보다는 아래여야 하므로
                      390 16px / 1920 20px w600 으로 보간했다. 20px 은 시안이 CTA·상품금액에
                      실제로 쓰는 값이라 스케일 밖으로 벗어나지 않는다.
                      라벨과 값을 같은 크기로 둔 것도 시안 금액 행들과 같은 규칙이다. */}
                  <div className="flex justify-between border-t border-line pt-3 text-[1rem] font-semibold leading-[1.4] sm:text-[1.25rem] sm:leading-[1.75rem]">
                    <dt>총 결제 금액</dt>
                    <dd>{formatKRW(payAmount)}</dd>
                  </div>
                </dl>

                {/* 표시가/청구가 불일치 안내 — handlePay 가 서버 재계산 금액과 화면
                    payAmount 가 다를 때 세팅한다(amountMismatch). */}
                {amountMismatch && (
                  <p aria-live="polite" className="mt-4 text-[0.75rem] font-medium leading-[1.4] text-error">
                    {AMOUNT_MISMATCH_TEXT}
                  </p>
                )}

                {/* CTA 미충족 사유(P0) — 예전엔 비활성 사유가 화면에 0글자였다. 어느 조건이
                    안 채워졌는지 구체적으로 나열하고, 클릭하면 해당 체크박스로 스크롤+포커스
                    이동한다(scrollToRef). aria-live="polite" 로 체크 상태가 바뀔 때마다
                    스크린리더가 남은 사유를 다시 읽게 한다. 여러 줄이 쌓여도 벽처럼 보이지
                    않도록 배경 없이 얇은 텍스트 목록으로만 둔다. */}
                {unmetReasons.length > 0 && (
                  <div aria-live="polite" className="mt-4 space-y-1.5">
                    {unmetReasons.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={r.onClick}
                        className="block text-[0.75rem] font-medium leading-[1.4] text-error underline-offset-4 hover:underline"
                      >
                        {r.text}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handlePay}
                  disabled={!canPay}
                  // CTA — 시안 실측 390 14px w600 lh20 #ffffff / 1920 20px w600 lh28 #ffffff.
                  // ls 는 두 폭 모두 없어 tracking 을 주지 않는다. 배경색은 시안 인벤토리에
                  // 텍스트 색만 있으나 브랜드 CTA 색은 primary(#013262) 이고 결제 실패 화면
                  // CTA 도 이미 이 토큰이다.
                  // 비활성 — 원래 토큰 주석대로 bg-line(#d7d7d7) + text-surface-footer(#f9fafb)
                  // 였는데 실측 명암비 1.38:1 로 라벨이 사실상 안 보였다(WCAG AA 최소 4.5:1에
                  // 크게 못 미침). bg-surface-card(#f9fafc) + text-ink(#525252) + border-line
                  // 조합으로 교체 — 명암비 7.48:1 로 계산 확인(브라우저 getComputedStyle 기반
                  // relative luminance 공식, 4.5:1 요건을 여유 있게 만족). 규칙: 비활성 버튼도
                  // 라벨이 판독 가능해야 한다 — 배경·텍스트 어느 조합이든 최소 4.5:1을 유지할 것.
                  className={`mt-6 w-full rounded-xl py-4 text-[0.875rem] font-semibold leading-[1.25rem] transition sm:text-[1.25rem] sm:leading-[1.75rem] ${
                    canPay
                      ? 'bg-primary text-white hover:brightness-125'
                      : 'cursor-not-allowed border border-line bg-surface-card text-ink'
                  }`}
                >
                  {loading ? '결제창 여는 중…' : `${formatKRW(payAmount)} 결제하기`}
                </button>
                {/* 시안에 없는 안내문. 시안 최소 크기가 12px 이라 11px → 12px w400 로 올리고
                    보조 텍스트 토큰(ink.sub)을 쓴다. */}
                <p className="mt-3 text-center text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
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
