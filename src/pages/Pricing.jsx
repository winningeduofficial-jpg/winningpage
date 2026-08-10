import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SINGLE_SELECT_NOTICE, formatKRW } from '../data/pricingCatalog';
import { useProducts } from '../lib/products';
import { saveCart } from '../lib/cart';

// products.service_key → 서비스 상세 페이지 라우트.
// 링크 목적지는 products 테이블에 컬럼을 추가하지 않고 코드측 매핑으로 둔다 —
// 라우트는 src/App.jsx 소유이고, 이미 src/data/navigation.js 의 GNB 도 같은
// 목적지를 코드에 적어 두고 있어(목표관리·콜멘토·수행평가) 정본이 둘로 갈리지 않는다.
// susi(위닝 수시예측)는 상세 페이지가 아직 없어서 의도적으로 비어 있다 —
// src/App.jsx 확인 결과 /services/{goal,callmentor,performance,self-assessment,research}
// 는 있지만 수시예측 상세에 해당하는 라우트가 없다(/admission/susi 는 입시 사례
// 게시판이라 서비스 상세가 아니다). 죽은 링크를 만드는 대신 링크를 렌더하지 않는다
// (390 시안 1882-16307 에는 수시예측에도 '자세히보기'가 있으므로, 상세 페이지 신설
// 여부는 결정 대기 항목 — 라우트가 생기면 여기 한 줄 추가로 복구된다).
// diagnose(학습진단)는 여기 없는 것이 정상이다 — 누락이 아니라 사용자 확정 정책이다.
// 재료는 둘 다 실재한다: 라우트 /learning-diagnosis(src/App.jsx) 도 있고, dev DB 실측
// 활성 service_key 에도 diagnose 가 1건 있다(sql/53_pricing_susi_restore.sql:45 기록
// = goal 4 / mentor 1 / suhaeng 5 / diagnose 1, service_sort_order 99).
// 그럼에도 요금 페이지에서는 학습진단 상세로 "링크하지 않는다" — 학습진단은 무료라
// 결제 플로우에서 빼기로 사용자가 확정했다. 따라서 '링크 대상이 있는데 빠졌다' 는
// 이유로 diagnose 항목을 되살리지 말 것(직전 라운드에 추가했다가 이 정책으로 철회됨).
const SERVICE_DETAIL_ROUTES = {
  goal: '/services/goal',
  mentor: '/services/callmentor',
  suhaeng: '/services/performance'
};

export default function Pricing() {
  const navigate = useNavigate();
  const { services, loading, error, refetch } = useProducts();
  // 서비스별 단일 선택: { [serviceKey]: productId }
  const [selected, setSelected] = useState({});

  function toggle(serviceKey, productId) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[serviceKey] === productId) delete next[serviceKey];
      else next[serviceKey] = productId;
      return next;
    });
  }

  // 선택된 상품 목록(장바구니 형태로 enrich)
  const selectedItems = useMemo(() => {
    const items = [];
    services.forEach((service) => {
      const pid = selected[service.key];
      if (!pid) return;
      const product = service.products.find((p) => p.id === pid);
      if (!product) return;
      items.push({
        id: product.id,
        serviceKey: service.key,
        serviceName: service.name,
        serviceDesc: service.desc,
        name: product.name,
        listPrice: product.listPrice,
        price: product.price,
        badge: product.badge,
        recommended: product.recommended
      });
    });
    return items;
  }, [services, selected]);

  const totalPrice = selectedItems.reduce((sum, it) => sum + Number(it.price || 0), 0);
  const listTotal = selectedItems.reduce(
    (sum, it) => sum + Number(it.listPrice || it.price || 0),
    0
  );
  const discountTotal = listTotal - totalPrice;

  async function goCheckout() {
    if (selectedItems.length === 0) return;
    saveCart(selectedItems); // 선택 항목 저장 (로그인 후에도 유지)
    // 로그인 안 됐으면 로그인 페이지로 → 로그인 후 바로 결제 페이지로 복귀
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
      navigate('/login?redirect=/checkout');
      return;
    }
    navigate('/checkout');
  }

  return (
    <>
      <main className="min-h-screen bg-white pt-16">
        {/* 타이틀. 좌우 패딩은 아래 콘텐츠 컨테이너와 같은 리듬(390 1.25rem / sm 이상 2rem). */}
        <section className="px-5 pb-4 pt-16 text-center sm:px-8">
          <p className="text-sm font-black text-accent">나에게 맞는 서비스를 선택해주세요</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-ink-title sm:text-[2.5rem]">
            결제할 서비스를 선택해주세요
          </h1>
        </section>

        {/* 서비스 섹션들.
            컨테이너는 프로젝트 공통 관용구 `mx-auto w-full max-w-content px-5 sm:px-8` 를 쓴다
            (정의: components/landing/NewsSection.jsx:13 주석, tailwind.config.js:6-11).
            max-w-content = 72.75rem = outer 1164px 이고 sm 이상에서 px-8(32×2 = 64px)이 붙어
            실제 콘텐츠 폭은 1164 − 64 = 1100px 이다. Header.jsx:683(좌표계 2 = nav·메가 컬럼)
            과 SiteFooter.jsx:64(lg+ 브랜치)가 같은 토큰 + px-8 이라 본문 좌단이 그 둘과 정확히
            일치한다 — 이게 이 규약을 쓰는 이유다. 실측(layout/본문 콘텐츠 좌단 = 헤더 nav 좌단
            = 푸터 lg 좌단): 1920 → 410, 1440 → 170, 1280 → 90(nav 는 desktop 미만이라 숨지만
            푸터와 90 일치), 768 → 32, 390 → 20.
            단 헤더 '로고'는 좌표계 1(max-w-[120rem] px-8 / 2xl:px-[7.5rem]) 위에 있어 이 규약과
            정렬 대상이 아니다 — 로고 좌단은 1920 에서 120, 1440·1280 에서 32 다(Header.jsx:22-28
            의 두 좌표계 주석 참고). 푸터 모바일 브랜치(SiteFooter.jsx:31)는 px-6 라 390 에서
            좌단 24 로 우리 20 과 4px 다르지만, 이는 랜딩 섹션(px-5 sm:px-8)들도 동일한
            전역 기존 거동이라 이 페이지에서 손대지 않는다.
            시안 1920 프레임의 콘텐츠 1596px 은 채택하지 않는다
            (사용자 확정: 결제 화면도 전역 컨텐츠 영역 규약을 따른다).
            폭별 inner = min(뷰포트 − 64, 1100): 1920/1440/1280 → 1100, 768 → 704.
            sm 미만은 상한(1164)에 걸리지 않으므로 px-5(20×2 = 40px)가 폭을 정한다 → 390 → 350.
            하단 여백: sm 이상은 고정 결제바(높이 약 5.5rem)를 피하려고 pb-40을 유지하고,
            모바일은 요약 블록이 문서 흐름에 들어오므로 pb-16으로 줄인다. */}
        <div className="mx-auto w-full max-w-content px-5 pb-16 pt-10 sm:px-8 sm:pb-40">
          {loading && (
            <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm font-bold text-ink-sub">
              요금 정보를 불러오는 중입니다.
            </div>
          )}

          {!loading && (error || services.length === 0) && (
            <div className="rounded-2xl border border-error/30 bg-white p-10 text-center">
              <p className="text-sm font-bold text-error">
                요금 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </p>
              <button
                type="button"
                onClick={refetch}
                className="mt-4 rounded-lg border border-line px-5 py-2.5 text-sm font-bold text-ink-title transition hover:bg-surface-card"
              >
                다시 시도
              </button>
            </div>
          )}

          {!loading && !error && services.map((service) => (
            <section key={service.key} className="mb-16">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-2xl font-black text-ink-title">{service.name}</h2>
                {/* 390 시안(1882-16307, 프레임 1882:16340)의 이 줄은 자식이 정확히 둘이다 —
                    서비스명 텍스트(w96) + 8px 뒤 '자세히보기' 텍스트(x104 w52 h17). 셰브론
                    아이콘이 없다. 반대로 1920 시안(1882-10810)과 1280 시안(1882-15190,
                    1882-15614)에는 '자세히보기' 문구가 0건이고 셰브론만 있다
                    (390 은 4건 / 10810·15190·15614 는 모두 0건).
                    그래서 두 표현을 하나의 Link 안에 담아(문구 sm:hidden / 셰브론 hidden sm:block)
                    BP 무관하게 실제로 클릭 가능한 요소가 되게 한다. 기존에는 sm 이상에서
                    셰브론이 클릭 불가 장식으로 남아 있었다.

                    히트영역: 링크 박스 자체는 시안대로 두고(글자·아이콘 크기 = 시안값)
                    ::after 오버레이로만 44×44 을 확보한다 — 레이아웃에 참여하지 않으므로
                    검증 통과값(390 inner 350 / 플랜 행 64px / 1920 inner 1100)에 영향이 없다.
                    패딩+음수마진 방식은 금지: h2 와의 시안 gap 8px(gap-2)을 음수마진이
                    잠식해 8 − 11 = −3px, 즉 제목과 3px 겹친다.
                    실측 링크 박스 — sm 이상 22×22(셰브론), 390 56.18×19.5(문구).
                      · 세로: top-1/2 + h-11 + -translate-y-1/2 → 앵커 높이와 무관하게 두
                        밴드 모두 44px. 아래로 넘치는 양 = (44 − 앵커높이)/2 = sm 11px /
                        390 12.25px 이고, 앵커 하단~설명 문단(<p>) 상단 실측 여유가
                        sm 13px / 390 14.25px 이라 설명 문단의 클릭을 훔치지 않는다
                        (여유 = 행 32px 안에서 앵커 아래 남는 슬랙 + mb-2 8px).
                        위로 넘치는 만큼은 섹션 mb-16(64px, 첫 섹션은 컨테이너 pt-10 40px)
                        의 빈 여백이라 겹칠 대상이 없다.
                      · 가로: 390 은 앵커가 이미 56.18px(≥44)이라 w-full 로 충분.
                        sm 이상은 22px 뿐이라 확장이 필요한데 좌측 여유는 h2 와의 gap 8px
                        까지다 → -left-2(−8) + w-11(44) 로 좌 8 / 우 14 비대칭 확장
                        (8 + 22 + 14 = 44 ✓). 우측은 이 행의 빈 공간이라 잠식할 대상이 없다.
                        대칭 확장(-inset 11)이면 h2 마지막 3px 이 링크 히트영역에 먹힌다.
                    이 수치들은 뷰포트 폭에 의존하지 않는다(앵커 크기·gap 모두 BP 고정값)
                    → 시안이 없는 구간(640~1183 / 1440~1919)에도 보간 없이 그대로 성립한다. */}
                {SERVICE_DETAIL_ROUTES[service.key] ? (
                  <Link
                    to={SERVICE_DETAIL_ROUTES[service.key]}
                    aria-label={`${service.name} 자세히보기`}
                    className="relative inline-flex shrink-0 items-center text-ink-title after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] sm:after:-left-2 sm:after:w-11"
                  >
                    <span className="text-[0.8125rem] font-bold underline underline-offset-2 sm:hidden">
                      자세히보기
                    </span>
                    <ChevronRight
                      size={22}
                      strokeWidth={3}
                      aria-hidden="true"
                      className="hidden sm:block"
                    />
                  </Link>
                ) : null}
                {/* susi(위닝 수시예측)는 상세 라우트가 없어 링크를 만들 수 없다(위 상단
                    SERVICE_DETAIL_ROUTES 주석 참고). 이때 셰브론만 남기면 sm 이상에서
                    '눌러도 아무 일이 없는' 거짓 어포던스가 되므로 아무것도 렌더하지 않는다 —
                    390 시안에도 이 서비스의 셰브론은 없고, sm 이상 시안의 셰브론은 상세
                    페이지가 있다는 전제의 표기다. 상세 페이지가 생기면
                    SERVICE_DETAIL_ROUTES 에 susi 를 추가하는 것만으로 문구(390)와
                    셰브론(sm 이상)이 함께 되살아난다. */}
              </div>
              {service.desc && (
                <p className="mb-6 max-w-[47.5rem] text-[0.8125rem] leading-relaxed text-ink-sub">
                  {service.desc}
                </p>
              )}

              {/* 390 시안의 플랜 행 간격은 8px(1882:16346 이하 행 y = 0/72/144/216, 행 높이 64
                  → 간격 8px)이라 space-y-2, sm 이상은 기존 space-y-3(12px)을 유지한다. */}
              <div className="space-y-2 sm:space-y-3">
                {service.products.map((product) => {
                  const isSelected = selected[service.key] === product.id;
                  const hasDiscount = product.listPrice > product.price;
                  // 390 시안(1882-16307)의 플랜 라벨은 '[1개월]' 처럼 대괄호 구간만이다.
                  // 서비스명이 바로 위 헤더에 이미 있어 상품명 전문은 중복이라서다.
                  // DB(products.name)는 건드리지 않고 표시 시점에만 파생시킨다. 대괄호가
                  // 없는 상품명은 잘라낼 구간이 없으니 전문을 그대로 쓴다.
                  const shortLabel = (product.name.match(/^\[[^\]]*\]/) || [product.name])[0];
                  // 390 시안은 '약 11%할인 80,000원' 처럼 한 줄 단일 텍스트다. DB badge
                  // ('약 11% 할인')의 '%' 뒤 공백이 시안에 없으므로 표시 시점에만 지운다.
                  const compactBadge = product.badge
                    ? product.badge.replace(/%\s+할인/, '%할인')
                    : '';
                  // 플랜 행 390 시안 실측(1882:16307 metadata 재확인 — 행 outer
                  // Frame 1597883375(1882:16346) = 310×64 / inner Frame 1597883431(1882:16347)
                  // = 280×40 at x=15,y=12, gap 20):
                  // → 시안 패딩은 전방향 균일이 아니다. 좌우 15(310 − 280 = 30 = 15×2),
                  //   상하 12(12 + 40 + 12 = 64). 아래 높이 유도는 상하 12 만 쓴다.
                  // → outer 310 은 시안값이고 현행 렌더 폭이 아니다. 전역 컨텐츠 규약
                  //   (mx-auto max-w-content px-5)으로 390 의 행 outer 는 350 이다(실측).
                  //   310 을 목표값으로 되돌리지 말 것.
                  // 시안 행 높이 64 = 12 + 내용 40 + 12 이지만, Figma 의 stroke 는 레이아웃을
                  // 먹지 않고 패딩 안쪽에 겹쳐 그려진다. CSS 는 border 가 폭·높이를 차지하므로
                  // (auto 높이 = border 2 + 패딩 + 내용) 패딩을 12 로 두면 64 가 아니라 66 이 된다.
                  // 그래서 가장자리~내용 거리를 시안 상하값과 같은 12px 로 맞추되 그 12 를
                  // border 1 + 패딩 11(0.6875rem) 로 쪼갠다 → 1+11+40+11+1 = 64 ✓.
                  // 1행짜리 행(내용 20px)은 1+11+20+11+1 = 44 라 min-h-[4rem](64px, border-box)
                  // 가 하한으로 받쳐 64 가 된다. sm 이상은 기존 20px 패딩 유지(sm:p-5).
                  // p-* 는 4방향이라 좌우도 12 가 된다(시안 좌우 15 와 3px 차). 행 outer 가
                  // 310 → 350 으로 넓어져 좌우 여백은 시안보다 오히려 넉넉하고, 높이 64 를
                  // 정확히 맞추는 쪽을 택한 결과다 — 좌우만 15 로 떼어낼 이유가 없다.
                  return (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => toggle(service.key, product.id)}
                      className={`flex min-h-[4rem] w-full items-center justify-between gap-5 rounded-2xl border p-[0.6875rem] text-left transition sm:min-h-0 sm:gap-4 sm:p-5 ${
                        isSelected
                          ? 'border-accent bg-surface-info ring-1 ring-accent/30'
                          : 'border-line bg-white hover:border-ink-sub'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2 sm:gap-3">
                        {/* 체크박스는 390 시안 16px(1rem), sm 이상은 기존 24px(1.5rem).
                            390 좌측 그룹 예산 = 행 inner 폭 − 좌↔우 gap 20 − 금액블록 126.
                            전역 컨텐츠 규약(px-5)에서 390 컨테이너 inner = 350 이므로
                            행 inner = 350 − border 1×2(2) − 패딩 11×2(22) = 326
                            (border 를 빼는 이유: src/index.css:5 의 * { box-sizing: border-box }
                             때문에 행의 350px 안에 테두리 2px 이 포함된다.)
                            → 좌측 그룹 326 − 20 − 126 = 180px, 라벨 몫은 180 − 체크 16 − gap 8
                            = 156px 로 실측 최장 '[12개월 30회 이용권]' 112.8px 을 넉넉히 덮는다.
                            (과거 px-10 시절 inner 310 에서는 라벨 몫이 116px 뿐이라 체크박스를
                             16px 로 줄이는 것이 폭 제약이기도 했다. 규약 전환으로 그 제약은
                             사라졌고, 16px 은 이제 순수하게 390 시안 실측 근거로만 남는다.)
                            체크 아이콘도 박스에 맞춰 12px(h-3)로 줄인다 — 16px 박스에 15px
                            아이콘은 테두리를 덮는다. size 속성 대신 클래스로 지정해야 BP 분기가
                            먹는다(lucide 의 size 는 width/height 프리젠테이션 속성이고 CSS 가 이긴다). */}
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition sm:h-6 sm:w-6 ${
                            isSelected ? 'border-accent bg-accent' : 'border-line bg-white'
                          }`}
                        >
                          {isSelected && (
                            <Check
                              strokeWidth={3.5}
                              className="h-3 w-3 text-white sm:h-[0.9375rem] sm:w-[0.9375rem]"
                            />
                          )}
                        </span>
                        {/* 390은 대괄호 구간만(shortLabel), sm 이상은 상품명 전문
                            (1920 시안 1882-10810 / 1280 시안 1882-15190).
                            한국어 상품명이 어절 중간에서 끊기지 않도록 truncate 대신 break-keep.
                            390 타이포는 시안 실측(1882:16307 라벨 TEXT 110×20)대로
                            13px(0.8125rem) / lh 20px(1.25rem) / weight 500 이다. 15px 이면
                            '[12개월 30회 이용권]' 이 110px 을 넘어 2줄로 접혔다.
                            sm 이상은 기존 15px / bold / 상속 lh(1.5 = leading-normal) 유지. */}
                        <span className="break-keep text-[0.8125rem] font-medium leading-[1.25rem] text-ink-title sm:text-[0.9375rem] sm:font-bold sm:leading-normal">
                          <span className="sm:hidden">{shortLabel}</span>
                          <span className="hidden sm:inline">{product.name}</span>
                        </span>
                        {/* '추천' 배지는 sm 이상 시안에만 있고 390 시안(1882-16307, 1882-16017)
                            에는 0건이라 모바일에서 숨긴다. 배지 개수는 BP 별로 다르다 —
                            1920 은 1882-10810 이 2건, 3408-4832 가 3건이고 1280(1882-15190,
                            1882-15614)은 3건이다. 어느 상품에 붙는지는 시안이 아니라 DB
                            (products.recommended)가 정본이라 개수 차이는 코드에 반영하지 않는다. */}
                        {product.recommended && (
                          <span className="hidden shrink-0 rounded-md bg-accent px-2 py-0.5 text-[0.6875rem] font-bold text-white sm:inline-block">
                            추천
                          </span>
                        )}
                      </span>

                      {/* 금액 블록: 390 시안 실측(Frame 1597883433 = 126×40)대로 폭을 126px
                          (7.875rem)로 고정 + shrink-0 → 남는 좌측(전역 규약 inner 350 기준
                          180px, 위 체크박스 주석의 산식)을 라벨 그룹이 온전히 받는다.
                          폭을 열어두면 금액 텍스트가 라벨 공간을 잠식해 라벨이 접힌다.
                          2행 스택(정가 위 / 할인 아래)은 이미 시안 구조와 같고, 각 행 lh 를
                          20px 으로 두어 블록 높이가 20+20 = 40px = 시안값이 된다.
                          sm 이상은 기존 w-auto + leading-tight 유지. */}
                      <span className="flex w-[7.875rem] shrink-0 flex-col items-end leading-[1.25rem] sm:w-auto sm:leading-tight">
                        {hasDiscount && (
                          <span className="text-[0.75rem] text-ink-sub line-through">
                            {formatKRW(product.listPrice)}
                          </span>
                        )}
                        {/* 390: 할인 라벨과 금액이 한 줄 단일 텍스트('약 11%할인 80,000원').
                            sm 이상: 시안(1920 = 1882-10810 / 1280 = 1882-15190)대로 라벨(blue)과
                            금액을 두 요소로 분리. */}
                        {/* 390 금액 블록 폭이 시안대로 126px 이라 이 한 줄이 126px 안에 들어가야
                            한다. 최장 문구 '40%할인 180,000원' 실측 폭은 15px 에서 141.5px 로
                            126 을 넘어 2줄이 됐다(행 높이 86px). 13px 이면 141.5×13/15 ≈ 122.6px
                            로 1줄이며, 라벨과 같은 13px 이라 390 타이포 단계도 일관된다.
                            14px 은 141.5×14/15 ≈ 132px 로 여전히 초과.
                            이 span 자체가 sm:hidden(390 전용)이라 sm 값은 아래 sm:flex 블록이
                            그대로 15px 을 쓴다 — 데스크톱은 무변경. */}
                        <span className="text-[0.8125rem] font-black text-ink-title sm:hidden">
                          {compactBadge
                            ? `${compactBadge} ${formatKRW(product.price)}`
                            : formatKRW(product.price)}
                        </span>
                        <span className="hidden items-center gap-2 sm:flex">
                          {product.badge && (
                            <span className="text-[0.8125rem] font-bold text-accent">
                              {product.badge}
                            </span>
                          )}
                          <span className="text-[0.9375rem] font-black text-ink-title">
                            {formatKRW(product.price)}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {service.products.length > 1 && (
                <p className="mt-4 text-[0.75rem] text-ink-sub">{SINGLE_SELECT_NOTICE}</p>
              )}
            </section>
          ))}
        </div>

        {/* 모바일 결제 요약 (시안 1882-16017) — 390 시안은 하단 고정 바가 아니라 마지막 서비스
            섹션 아래에 붙는 문서 흐름 밴드다. 3행(총 판매가/총 할인금액/총 결제금액) + 풀폭 CTA.
            뷰포트 좌우를 꽉 채우는 밴드라 콘텐츠 컨테이너 밖(main 직속)에 둔다.
            내부 좌우 패딩은 위 콘텐츠 컨테이너의 모바일 패딩과 같은 px-5(1.25rem)로 맞춰
            390에서 행이 콘텐츠 컬럼과 정렬되게 한다(sm 이상은 hidden 이라 base 값만 쓰인다). */}
        {selectedItems.length > 0 && (
          // 배경은 아래 sm+ 고정 바와 같은 토큰을 쓴다.
          //   배경   surface.info(#e9f4ff) — 두 요약 UI가 각자 하드코딩하던 e3eeff의 토큰 대응값
          //   금액강조 primary(#013262), CTA accent(#0B84FD) — 390 시안 실측색과 일치
          // (sm+ 고정 바의 할인금액은 기존 색 역할을 유지해 accent 다. 통일 여부는 사용자 판단.)
          <div className="bg-surface-info px-5 py-7 sm:hidden">
            <dl className="space-y-2.5 text-[0.875rem]">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-medium text-ink-sub">총 판매가</dt>
                <dd className="font-bold text-ink-title">{formatKRW(listTotal)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-medium text-ink-sub">총 할인금액</dt>
                {/* 390 시안(1882-16017)만 할인금액에 마이너스 부호가 붙는다('-273,600원').
                    요약 바를 실제로 그린 sm 이상 시안은 1280 = 1882-15190 과
                    1920 = 3408-4832 이고 둘 다 '151,400원' 처럼 부호 없이 표기하므로
                    아래 고정 바는 현행 유지. (1882-10810 에는 요약 바 자체가 없다 —
                    '총 판매가'·'총 할인금액' 문자열이 0건이라 근거로 쓸 수 없다.) */}
                <dd className="font-bold text-primary">
                  {discountTotal > 0 ? `-${formatKRW(discountTotal)}` : formatKRW(0)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-medium text-ink-sub">총 결제금액</dt>
                <dd className="text-[1rem] font-black text-primary">{formatKRW(totalPrice)}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={goCheckout}
              className="mt-5 w-full rounded-lg bg-accent py-3.5 text-[0.9375rem] font-bold text-white transition hover:brightness-95"
            >
              {formatKRW(totalPrice)} 결제하기
            </button>
          </div>
        )}
      </main>

      {/* 하단 플로팅 결제바 — sm 이상 전용(모바일은 위 인플로우 요약 블록이 대체한다). */}
      {selectedItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 hidden bg-surface-info shadow-[0_-0.375rem_1.5rem_rgba(13,27,42,0.08)] sm:block">
          {/* 요약 바 내부 컨테이너는 본문 컨테이너(:120)와 **폭 토큰 `max-w-content` +
              좌우 패딩 `px-5 sm:px-8`** 이 같아야 한다 — 클래스 문자열 전체가 같은 것은
              아니다(이쪽은 flex/items-center/justify-between/gap-6/py-5 가 더 붙고, 본문은
              pb-16 pt-10 sm:pb-40 을 쓴다). 근거는 위 본문 컨테이너 주석 참고.
              폭만 맞추고 좌우 패딩이 다르면 요약바 텍스트가 플랜 행보다 좌우로 밀려
              들어가므로, 폭 토큰과 좌우 패딩은 반드시 함께 수정해야 한다.
              base `px-5` 는 부모가 hidden sm:block(:388)이라 렌더되지 않는다 — 실제로
              적용되는 건 sm 쪽 px-8 뿐이다. 그래도 남겨 두는 이유는 본문의 좌우 패딩
              토큰과 문자 단위로 대조할 수 있게 하려는 것이고, sm 미만에서는 부모가
              숨기므로 무해하다. */}
          <div className="mx-auto flex w-full max-w-content items-center justify-between gap-6 px-5 py-5 sm:px-8">
            {/* 부모가 hidden sm:block 이라 base 값은 절대 적용되지 않는다 → 단일 gap-16. */}
            <div className="flex items-center gap-16">
              <div className="text-center">
                <p className="text-[0.8125rem] font-medium text-ink-sub">총 판매가</p>
                <p className="mt-1 text-[1.1875rem] font-black text-ink-title">
                  {formatKRW(listTotal)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[0.8125rem] font-medium text-ink-sub">총 할인금액</p>
                {/* 데스크톱 고정 바는 '현행 유지' 범위이므로 색 역할을 바꾸지 않는다 —
                    기존 blue-600(#2563eb)의 토큰 대응값인 accent(#0B84FD)를 쓴다.
                    (모바일 밴드는 390 시안 실측색이 네이비라 primary 를 쓴다. 1920/1280 요약바의
                    시안 실측색은 확인 수단이 없어 통일 여부는 사용자 판단 대기.) */}
                <p className="mt-1 text-[1.1875rem] font-black text-accent">
                  {formatKRW(discountTotal)}
                </p>
              </div>
            </div>
            {/* CTA 는 모바일 밴드와 동일하게 accent. 그림자 틴트도 accent(#0B84FD) rgb 로 맞춘다. */}
            <button
              type="button"
              onClick={goCheckout}
              className="shrink-0 rounded-lg bg-accent px-8 py-3.5 text-[0.9375rem] font-bold text-white shadow-[0_0.625rem_1.625rem_rgba(11,132,253,0.28)] transition hover:brightness-95"
            >
              {formatKRW(totalPrice)} 결제하기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
