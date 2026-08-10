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
// 활성 service_key 에도 diagnose 가 1건 있다(sql/52_pricing_susi_restore.sql:11 기록
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
        {/* 타이틀. 좌우 패딩은 아래 콘텐츠 컨테이너와 같은 리듬(390 2.5rem / sm 이상 1.5rem). */}
        <section className="px-10 pb-4 pt-16 text-center sm:px-6">
          <p className="text-sm font-black text-accent">나에게 맞는 서비스를 선택해주세요</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-ink-title sm:text-[2.5rem]">
            결제할 서비스를 선택해주세요
          </h1>
        </section>

        {/* 서비스 섹션들.
            콘텐츠 폭은 시안 실측을 rem으로 환산한다. max-w 는 Tailwind 기본
            box-sizing:border-box 기준이라 좌우 패딩을 포함한 outer 값이다 — 그래서 시안
            '콘텐츠(inner)' 폭에 sm 이상 좌우 패딩 px-6(24px×2 = 48px)을 더해 잡는다.
              1280 프레임 inner 1040px + 48 = 1088px ÷16 = 68rem
              1920 프레임 inner 1596px + 48 = 1644px ÷16 = 102.75rem
            (시안 inner 값을 max-w 에 그대로 넣으면 실제 inner 가 992/1548px 로 48px 부족해진다.)
            상한을 base→desktop 2단으로만 끊으면 1088~1440 구간 내내 inner 가 1040 에 고정돼
            1439px 에서 좌우 여백이 (1439−1088)/2 + 24 ≈ 200px 까지 벌어지고(1920 시안의 162px
            보다도 넓다 = 뷰포트가 커질수록 여백이 좁아지는 역전), 1440px 에서 상한이 1644px 로
            바뀌는 순간 inner 1040 → 1392px, 여백 200 → 24px 로 급점프한다.
            시안에 1280~1920 중간 프레임이 없으므로 중간 BP 값을 발명하는 대신, 두 시안 프레임을
            동시에 정확히 만족하는 단일 유동식으로 둔다:
              max-w = min(102.75rem, max(68rem, 100vw − 12rem))
              · 12rem(192px) = 1280 프레임 좌우 여백 120×2(240px) − 좌우 패딩 48px
              · 1280px → max(1088, 1280−192=1088) = 1088 → inner 1040, 여백 120 (시안 일치)
              · 1920px → min(1644, 1920−192=1728) = 1644 → inner 1596,
                여백 (1920−1644)/2 + 24 = 162 (시안 일치)
              · 그 사이(예: 1366px) → 1174 → inner 1126, 여백 120 으로 연속. 하한/유동 교차점이
                정확히 1280px 이라 점프가 없고 inner·여백이 모두 단조 증가한다.
              · 하한 68rem 덕분에 1088px 미만(모바일 포함)에서는 100vw 항이 지배하지 못한다.
            390 프레임은 콘텐츠 310px = 뷰포트 390 − 좌우 40px이라 상한(max-w)이 아니라 좌우
            패딩으로 잡는다 — 상한을 걸면 390보다 넓은 모바일에서 콘텐츠가 310px에 묶여 여백만
            늘어난다. px-10 = 2.5rem = 40px, sm 이상은 기존 px-6 유지.
            하단 여백: sm 이상은 고정 결제바(높이 약 5.5rem)를 피하려고 pb-40을 유지하고,
            모바일은 요약 블록이 문서 흐름에 들어오므로 pb-16으로 줄인다. */}
        <div className="mx-auto max-w-[min(102.75rem,max(68rem,100vw_-_12rem))] px-10 pb-16 pt-10 sm:px-6 sm:pb-40">
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
                    셰브론이 클릭 불가 장식으로 남아 있었다. */}
                {SERVICE_DETAIL_ROUTES[service.key] ? (
                  <Link
                    to={SERVICE_DETAIL_ROUTES[service.key]}
                    aria-label={`${service.name} 자세히보기`}
                    className="inline-flex shrink-0 items-center text-ink-title"
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
                  // 플랜 행 390 시안 실측(1882:16307 의 행 outer Frame 1597883375 = 310×64,
                  // padding 12 전방향 / inner Frame 1597883431 = 280×40, gap 20):
                  // 시안 행 높이 64 = 12 + 내용 40 + 12 이지만, Figma 의 stroke 는 레이아웃을
                  // 먹지 않고 패딩 안쪽에 겹쳐 그려진다. CSS 는 border 가 폭·높이를 차지하므로
                  // (auto 높이 = border 2 + 패딩 + 내용) 패딩을 12 로 두면 64 가 아니라 66 이 된다.
                  // 그래서 프레임 가장자리~내용 거리를 시안과 같은 12px 로 맞추되 그 12 를
                  // border 1 + 패딩 11(0.6875rem) 로 쪼갠다 → 1+11+40+11+1 = 64 ✓.
                  // 1행짜리 행(내용 20px)은 1+11+20+11+1 = 44 라 min-h-[4rem](64px, border-box)
                  // 가 하한으로 받쳐 64 가 된다. sm 이상은 기존 20px 패딩 유지(sm:p-5).
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
                            행 inner = 310 − border 1×2(2) − 패딩 11×2(22) = 286
                            (border 를 빼는 이유: src/index.css:5 의 * { box-sizing: border-box }
                             때문에 행의 310px 안에 테두리 2px 이 포함된다.)
                            → 좌측 그룹 286 − 20 − 126 = 140px, 라벨 몫은 140 − 체크 16 − gap 8
                            = 116px 로 시안 라벨 110px 을 덮는다(실측 최장 '[12개월 30회 이용권]'
                            = 112.8px). 체크박스 24px 이면 8px 을 더 먹어 라벨이 108px 로 모자라니
                            390 은 16px 이어야 한다.
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
                          (7.875rem)로 고정 + shrink-0 → 남는 좌측 140px 를 라벨 그룹이 온전히
                          받는다. 폭을 열어두면 금액 텍스트가 라벨 공간을 잠식해 라벨이 접힌다.
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
            내부 좌우 패딩은 위 콘텐츠 컨테이너와 같은 px-10(2.5rem)으로 맞춰 390에서 행이
            콘텐츠 컬럼과 정렬되게 한다. */}
        {selectedItems.length > 0 && (
          // 배경은 아래 sm+ 고정 바와 같은 토큰을 쓴다.
          //   배경   surface.info(#e9f4ff) — 두 요약 UI가 각자 하드코딩하던 e3eeff의 토큰 대응값
          //   금액강조 primary(#013262), CTA accent(#0B84FD) — 390 시안 실측색과 일치
          // (sm+ 고정 바의 할인금액은 기존 색 역할을 유지해 accent 다. 통일 여부는 사용자 판단.)
          <div className="bg-surface-info px-10 py-7 sm:hidden">
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
          {/* 요약 바 내부 폭·좌우 패딩을 본문 컨테이너와 완전히 동일하게 맞춘다(위 컨테이너의
              max-w 유동식 산정 근거 주석 참고) — 과거 1100px 고정이라 본문(852px)보다 넓었고,
              폭만 맞추고 패딩이 px-8 로 남으면 요약바 텍스트가 플랜 행보다 좌우 8px 안쪽으로
              들어간다. 두 값은 반드시 함께 수정해야 한다. */}
          <div className="mx-auto flex max-w-[min(102.75rem,max(68rem,100vw_-_12rem))] items-center justify-between gap-6 px-6 py-5">
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
