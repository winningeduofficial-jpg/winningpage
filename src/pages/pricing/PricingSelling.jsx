import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatKRW, SINGLE_SELECT_NOTICE } from "../../data/pricingCatalog";
import { saveCart } from "../../lib/cart";
import { useProducts } from "../../lib/products";
import { supabase } from "../../lib/supabase";

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
  goal: "/services/goal",
  mentor: "/services/callmentor",
  suhaeng: "/services/performance",
};

// 게스트(비로그인) 전용 판매 UI. 이 화면의 원래 이름은 Pricing 이었으나,
// 로그인 사용자 역할 분기가 추가되면서(2026-08-12b 팀 리드 지시) 얇은 분기
// 컨테이너 src/pages/Pricing.jsx 가 그 이름을 가져가고, 기존 본문은 그대로
// 이 파일로 옮겨졌다 — 로직·JSX·주석은 손대지 않았다(순수 이동, import
// 경로만 `../` → `../../`로 수정).
//
// 이 컴포넌트는 게스트(userId 없음) 브랜치에서만 렌더된다 — 로그인 사용자는
// Pricing.jsx 가 학생이면 StudentEnrollmentRequest, 학부모면 결제 진입 차단
// 모달, 그 외면 BlockedMemberNotice 로 미리 갈라낸다. 따라서 여기 안의
// goCheckout() 의 "로그인 안 됐으면 로그인 페이지로" 분기는 이 컴포넌트가
// 게스트 전용이 된 지금도 여전히 유효한 방어 코드다(레이스로 세션이 막
// 만료된 경우 등) — 제거하지 않는다.
//
// 로그인 후 복귀 목적지는 /checkout 이 아니라 /pricing 이다(팀 리드 지시,
// 2026-08-12 — 백도어 차단). /checkout 은 역할 분기만 할 뿐 이 카트 선택을
// 모른다 — 로그인 직후 /checkout 으로 바로 꽂아 넣으면 로그인한 사용자가
// Pricing.jsx 의 역할별 분기(학부모 차단 모달 등)를 거치지 않고 곧장
// /checkout 진입점으로 넘어가 버린다. /pricing 으로 되돌리면 useMemberType
// 기반 분기를 다시 타므로, 같은 역할 판정을 한 곳에서만 하게 된다.
export default function PricingSelling() {
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

  // radiogroup 키보드 규약(WAI-ARIA APG) — 화살표 이동은 포커스만 옮기는 게 아니라
  // 그 자리에서 바로 선택도 함께 바꾼다(네이티브 <input type=radio> 그룹과 동일 동작).
  // Home/End 는 넣지 않았다 — 그룹당 최대 5개(수시예측)뿐이라 화살표만으로 왕복 비용이
  // 낮고, APG 도 Home/End 를 "권장 확장"이지 필수로 두지 않는다. 필요해지면 이 함수에
  // 분기만 추가하면 된다.
  // 선택 갱신은 products 배열 인덱스로 계산한다(DOM 조회로 productId 문자열을 얻으면
  // product.id 가 숫자 PK 인 경우 dataset 은 항상 문자열이라 `selected[key] === product.id`
  // 비교가 타입 불일치로 깨질 수 있다) — 포커스 이동만 DOM 조회를 쓴다(타입 무관, 초점
  // 이동에는 실제 엘리먼트가 필요하므로).
  function handleRadioKeyDown(e, serviceKey, products, currentIndex) {
    // Escape = 그룹 선택 해제. 마우스는 재클릭으로 토글 해제가 되지만(아래 role="radio"
    // 주석 참고) 화살표 키는 "이동=선택"이라 키보드만 쓰는 사용자는 그룹 안에서 선택을
    // 완전히 뺄 방법이 없었다 — 그 격차를 메운다. preventDefault 도 실제로 해제를 수행했을
    // 때만 부른다: 상위(Header 메가메뉴 등)에서 Escape 를 다른 용도로 쓸 수 있어 무조건
    // 막으면 위험하기 때문이다(실측 결과 이 프로젝트엔 상위 Escape 리스너가 없어 — grep
    // 상 MobileNavDrawer/ColumnPreviewModal/AdmissionGuidelines/ComboField 뿐이고 이 페이지
    // 트리와 무관 — 지금은 충돌하지 않지만, 향후 상위에 리스너가 생겨도 이 조건부
    // preventDefault 덕에 선택이 없는 그룹에서는 그 리스너를 계속 막지 않는다).
    if (e.key === "Escape") {
      if (!(serviceKey in selected)) return; // 선택 없는 그룹 — 아무 것도 하지 않는다.
      e.preventDefault();
      setSelected((prev) => {
        const next = { ...prev };
        delete next[serviceKey];
        return next;
      });
      // 포커스는 옮기지 않는다(현재 버튼에 그대로 유지). roving tabindex는 위
      // hasSelectionInGroup/isRovingTabStop 이 selected 상태의 파생값이라 재렌더 때
      // 자동으로 "그룹에 선택 없음 → 첫 항목만 tabIndex 0" 규칙으로 돌아간다.
      return;
    }

    let delta = 0;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") delta = 1;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") delta = -1;
    else return;
    e.preventDefault(); // 기본 동작(페이지 스크롤)을 막는다.

    const nextIndex =
      (currentIndex + delta + products.length) % products.length;
    const nextProduct = products[nextIndex];
    setSelected((prev) => ({ ...prev, [serviceKey]: nextProduct.id }));

    const group = e.currentTarget.closest('[role="radiogroup"]');
    const nextEl = group?.querySelectorAll('[role="radio"]')[nextIndex];
    nextEl?.focus();
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
        recommended: product.recommended,
      });
    });
    return items;
  }, [services, selected]);

  const totalPrice = selectedItems.reduce(
    (sum, it) => sum + Number(it.price || 0),
    0,
  );
  const listTotal = selectedItems.reduce(
    (sum, it) => sum + Number(it.listPrice || it.price || 0),
    0,
  );
  const discountTotal = listTotal - totalPrice;

  async function goCheckout() {
    if (selectedItems.length === 0) return;
    saveCart(selectedItems); // 선택 항목 저장 (로그인 후에도 유지)
    // 로그인 안 됐으면 로그인 페이지로 → 로그인 후 /pricing 으로 복귀
    // (역할 분기를 다시 타게 한다 — 위 상단 주석 참고).
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
      navigate("/login?redirect=/pricing");
      return;
    }
    navigate("/checkout");
  }

  return (
    <>
      <main className="min-h-screen bg-white pt-16">
        {/* 타이틀. 좌우 패딩은 아래 콘텐츠 컨테이너와 같은 리듬(390 1.25rem / sm 이상 2rem). */}
        <section className="px-5 pb-4 pt-16 text-center sm:px-8">
          {/* 아이브로 — 시안 실측. 390(1882:16307) 16px w600 lh22 #0b84fd ls-0.32,
              1920(3408:4832 / 텍스트 3408:4872 높이 28 로 lh 교차확인) 20px w600 lh28 #0b84fd.
              rem: 16px = 1rem / lh22 = 1.375rem / 20px = 1.25rem / lh28 = 1.75rem.
              ls 는 두 밴드 모두 -0.02em 이다(-0.32/16 = -0.02, 1920 은 -0.4/20 = -0.02) →
              한 클래스로 통일. 기존 14px w900 은 시안에 없는 값이었다(시안 최대 무게 w700). */}
          <p className="text-[1rem] font-semibold leading-[1.375rem] tracking-[-0.02em] text-accent sm:text-[1.25rem] sm:leading-[1.75rem]">
            나에게 맞는 서비스를 선택해 주세요
          </p>
          {/* H1 — 390 24px w600 lh34 #525252 ls-0.48 / 1920 50px w600 lh70 #525252 ls-1
              (텍스트 3408:4873 높이 70 으로 lh 교차확인). ls 는 양쪽 모두 -0.02em
              (-0.48/24 = -0.02, -1/50 = -0.02).
              rem: 24px = 1.5rem / lh34 = 2.125rem / 50px = 3.125rem / lh70 = 4.375rem.
              색은 ink(#525252) — 시안 본문 기본색이다. ink-title(#181d24)은 시안이 실제로
              그 색을 쓰는 로그인 H1 전용이라 여기서는 쓰지 않는다.
              기존 40px w900 lh36(0.9배)은 "작고 무겁고 타이트"해서 시안 위계와 반대였다. */}
          <h1 className="mt-3 text-[1.5rem] font-semibold leading-[2.125rem] tracking-[-0.02em] text-ink sm:text-[3.125rem] sm:leading-[4.375rem]">
            결제할 서비스를 선택해 주세요
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
              {/* 이 버튼만 ink-title(#181d24) + w700 이 남아 있었다. 같은 파일의 타이포 주석들이
                  이미 "ink-title 은 시안 근거 없음(로그인 H1 전용 토큰)" 이라고 적고 있으므로
                  본문 기본색 ink(#525252) + 시안 최다 무게 w500 으로 정정했다.
                  크기(text-sm)는 시안에 없는 에러 분기 UI 라 현행 유지. */}
              <button
                type="button"
                onClick={refetch}
                className="mt-4 rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-card"
              >
                다시 시도
              </button>
            </div>
          )}

          {!loading &&
            !error &&
            services.map((service) => (
              <section key={service.key} className="mb-16">
                {/* 아래 여백이 390 에서만 mb-3(12px)인 이유: 시안 타이포로 내리면 이 행의 높이가
                  h2 lh20 로 정해져 '자세히보기' 앵커(17px) 아래 슬랙이 1.5px 뿐이다.
                  44×44 오버레이(사용자 확정)가 앵커 아래로 넘치는 양 (44 − 17)/2 = 13.5px 을
                  덮으려면 1.5 + 여백 ≥ 13.5, 즉 여백 ≥ 12px 이어야 한다 → mb-3.
                  mb-2(8px)면 4.5px 이 아래 요소 위로 겹쳐 44px 중 일부가 실질적으로 죽는다.
                  sm 이상은 행 높이가 h2 lh49 라 슬랙 (49−22)/2 = 13.5px 만으로 이미 충분하므로
                  기존 8px(sm:mb-2)을 그대로 유지한다. */}
                <div className="mb-3 flex items-center gap-2 sm:mb-2">
                  {/* 서비스명 — 390 18px w600 lh20 #525252 ls-0.36 / 1920 38px w700 lh49
                    #525252 ls-0.76 (시안 텍스트 3408:5260 높이 49 로 lh 교차확인).
                    ls 양쪽 -0.02em(-0.36/18, -0.76/38).
                    rem: 18px = 1.125rem / lh20 = 1.25rem / 38px = 2.375rem / lh49 = 3.0625rem.
                    기존 24px w900 #181d24 → 시안엔 없는 무게·색이었다. */}
                  {/* id는 아래 플랜 목록 radiogroup의 aria-labelledby 대상이다 —
                    서비스명을 그룹 라벨로 그대로 재사용해 별도 시각적 라벨을 추가하지
                    않아도 스크린리더가 "N개 중 M번째, [서비스명] 라디오 버튼"으로 읽는다. */}
                  <h2
                    id={`plan-group-label-${service.key}`}
                    className="text-[1.125rem] font-semibold leading-[1.25rem] tracking-[-0.02em] text-ink sm:text-[2.375rem] sm:font-bold sm:leading-[3.0625rem]"
                  >
                    {service.name}
                  </h2>
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
                    실측 링크 박스 — sm 이상 22×22(셰브론), 390 은 문구 타이포를 시안값
                    (12px/lh17)으로 내린 뒤 약 52×17.
                      · 세로: top-1/2 + h-11 + -translate-y-1/2 → 앵커 높이와 무관하게 두
                        밴드 모두 44px. 아래로 넘치는 양 = (44 − 앵커높이)/2 = sm 11px /
                        390 약 13.5px.
                        sm 이상은 행 높이가 h2 lh49 로 정해져 앵커 아래 슬랙 (49−22)/2 =
                        13.5px + mb-2 8px = 21.5px > 11px 이라 아래 요소를 침범하지 않는다.
                        390 은 h2 를 시안값(18px/lh20)으로 내리면서 행 높이가 20px 로 줄어
                        앵커 아래 슬랙이 1.5px 뿐이다. 그래서 오버레이를 줄이는 대신 이 행의
                        아래 여백을 390 에서만 mb-3(12px)로 키워 1.5 + 12 = 13.5px 를 확보했다
                        (위 헤더 행 주석의 산식). 실측 확인: 앵커 하단 → 설명 문단 상단 여유
                        13px, 오버레이 하단 지점이 링크로 히트된다.
                        추가 안전장치로 바로 아래 형제(설명 문단 <p> 와 플랜 목록 컨테이너)에
                        `relative` 를 붙였다 — 둘 다 이 Link 보다 DOM 뒤이고 z-index 가 auto 라
                        나중에 페인트되므로, 서브픽셀 반올림으로 1px 이라도 겹치면 그 지점의
                        히트 테스트를 아래 요소가 가져간다(레이아웃·시각 변화는 0).
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
                      className="relative inline-flex shrink-0 items-center text-ink after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] sm:after:-left-2 sm:after:w-11"
                    >
                      {/* 390 시안(1882:16307) '자세히보기' = 12px w500 lh17 #7a7a7a.
                        #7a7a7a 는 토큰이 없어 가장 가까운 ink-sub(#808080, 차이 6)로 쓴다
                        — ink(#525252)는 차이 40 으로 훨씬 멀다.
                        rem: 12px = 0.75rem / lh17 = 1.0625rem. ls 는 시안이 주지 않아 넣지 않는다.
                        기존 13px w700 은 시안에 없는 무게였다. 밑줄은 시안 인벤토리에 명시가
                        없어 기존 표현을 유지한다(이번 작업 범위는 타이포·색·간격).
                        셰브론(sm 이상) 색도 시안 본문 기본색 ink(#525252)로 내렸다 — 같은 행의
                        서비스명이 #525252 이고, 시안에 ink-title(#181d24)을 쓰는 근거가 없다. */}
                      <span className="text-[0.75rem] font-medium leading-[1.0625rem] text-ink-sub underline underline-offset-2 sm:hidden">
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
                {/* 설명문 — 390 12px w500 lh17 #7a7a7a(→ ink-sub) / 1920 20px w500 lh28 #808080
                  (시안 텍스트 3408:4881 이 1240×56 = 2줄 × lh28 로 교차확인).
                  rem: 12px = 0.75rem / lh17 = 1.0625rem / 20px = 1.25rem / lh28 = 1.75rem.
                  ls 는 시안 인벤토리에 없어 넣지 않는다.
                  max-w-[47.5rem](760px) 를 뺀 이유: 시안 설명문 폭은 1240px(컨테이너 1252 의
                  거의 전폭)이라 상한이 아니라 전폭이 정본이다. 13px 시절엔 760 상한이 무해했지만
                  20px 로 올리면 시안의 2줄이 4줄로 접혀 위계가 깨진다. 우리 콘텐츠 inner 는
                  최대 1100px 으로 시안 1240 보다 좁아, 상한을 없애도 시안보다 넓어질 일이 없다.
                  390 은 컨테이너 inner 350 이라 760 상한이 애초에 걸리지 않았다 → 무변화.
                  `relative` 는 위 '자세히보기' 44×44 오버레이와의 히트테스트 순서용이다
                  (위 주석의 390 4px 넘침 항목 참고 — 시각·레이아웃 영향 없음). */}
                {service.desc && (
                  <p className="relative mb-6 text-[0.75rem] font-medium leading-[1.0625rem] text-ink-sub sm:text-[1.25rem] sm:leading-[1.75rem]">
                    {service.desc}
                  </p>
                )}

                {/* 390 시안의 플랜 행 간격은 8px(1882:16346 이하 행 y = 0/72/144/216, 행 높이 64
                  → 간격 8px)이라 space-y-2, sm 이상은 기존 space-y-3(12px)을 유지한다. */}
                {/* `relative` 는 설명문 <p> 와 같은 이유(자세히보기 오버레이 히트테스트 순서).
                  설명문이 없는 서비스(desc 빈 값)에서는 이 컨테이너가 링크 바로 아래 형제가
                  되므로 여기에도 필요하다.
                  role="radiogroup" — 플랜은 서비스당 하나만 고를 수 있는데(단일선택) 기존엔
                  개별 <button> + 정사각 체크박스 시각이라 "여러 개 고를 수 있다"는 거짓
                  어포던스가 있었다(그걸 사후 수습하려고 아래 안내문이 3회 반복돼 있었다).
                  <input type=radio> 로 바꾸지 않고 <button role="radio"> 를 쓴 이유:
                  이미 이 버튼에 커스텀 hover/selected 배경(border-accent bg-surface-info
                  ring-1) 스타일이 붙어 있어 네이티브 radio 로 바꾸면 시각을 100% 숨기고
                  커스텀 인디케이터만 보이게 하는 append-only 트릭이 필요해지는데,
                  button+role 조합이 시각 변경 없이 동일한 AT 결과(role="radio",
                  aria-checked, group 내 posinset/setsize 자동 계산)를 주면서 코드도 더
                  적다. group 내 이동은 아래 handleRadioKeyDown 이 화살표 키로 처리한다
                  (roving tabindex: 그룹당 tabIndex=0 은 선택된 항목, 없으면 첫 항목뿐이라
                  Tab 으로 그룹에 들어오고 나가는 건 각 1번씩이다 — WAI-ARIA APG radiogroup
                  패턴). */}
                <div
                  role="radiogroup"
                  aria-labelledby={`plan-group-label-${service.key}`}
                  className="relative space-y-2 sm:space-y-3"
                >
                  {service.products.map((product, index) => {
                    const isSelected = selected[service.key] === product.id;
                    // roving tabindex — 그룹에 선택된 항목이 있으면 그 항목만 tabIndex 0,
                    // 없으면(아직 아무것도 고르지 않은 초기 상태) 첫 항목만 0. 나머지는 -1 —
                    // 그룹 전체가 Tab 정지점 하나가 되고, 그룹 안 이동은 화살표 키가 맡는다.
                    const hasSelectionInGroup = Boolean(selected[service.key]);
                    const isRovingTabStop = hasSelectionInGroup
                      ? isSelected
                      : index === 0;
                    const hasDiscount = product.listPrice > product.price;
                    // 390 시안(1882-16307)의 플랜 라벨은 '[1개월]' 처럼 대괄호 구간만이다.
                    // 서비스명이 바로 위 헤더에 이미 있어 상품명 전문은 중복이라서다.
                    // DB(products.name)는 건드리지 않고 표시 시점에만 파생시킨다. 대괄호가
                    // 없는 상품명은 잘라낼 구간이 없으니 전문을 그대로 쓴다.
                    const shortLabel = (product.name.match(/^\[[^\]]*\]/) || [
                      product.name,
                    ])[0];
                    // 390 시안은 '약 11%할인 80,000원' 처럼 한 줄 단일 텍스트다. DB badge
                    // ('약 11% 할인')의 '%' 뒤 공백이 시안에 없으므로 표시 시점에만 지운다.
                    const compactBadge = product.badge
                      ? product.badge.replace(/%\s+할인/, "%할인")
                      : "";
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
                    // 가 하한으로 받쳐 64 가 된다. lg 이상은 기존 20px 패딩 유지(lg:p-5 — 전환점을
                    // sm 에서 lg 로 옮긴 근거는 아래 ★ 항목).
                    // p-* 는 4방향이라 좌우도 12 가 된다(시안 좌우 15 와 3px 차). 행 outer 가
                    // 310 → 350 으로 넓어져 좌우 여백은 시안보다 오히려 넉넉하고, 높이 64 를
                    // 정확히 맞추는 쪽을 택한 결과다 — 좌우만 15 로 떼어낼 이유가 없다.
                    //
                    // ★ 플랜 행의 확대 전환점은 `sm`(640) 이 아니라 `lg`(1024) 다.
                    // 시안 캔버스는 390(1882:16307)과 1280(1882:15190·1882:15614) 둘뿐이고
                    // 640~1023 은 시안이 정의하지 않은 파생 구간이다. 전환점을 sm 에 두면 그 구간의
                    // 컨테이너 inner 가 576~960px 뿐인데 라벨이 24px 로 뛰어, 실측 14행 중
                    // 640 에서 4행 / 768 에서 1행이 2줄로 접혔다(잘림·가로 스크롤은 없지만 행 높이가
                    // 73/101/104px 로 갈려 위계가 들쭉날쭉했다). 그래서 이 행의 확대를 통째로
                    // lg 로 옮기고 640~1023 은 390 확정 행을 그대로 쓴다 —
                    // 근거 있는 두 값(390 / 1280)만 쓰고 18px 같은 중간 단계는 발명하지 않는다.
                    // 함께 옮긴 클래스(이 button 하위 전부, 같은 전환점을 쓰던 항목들):
                    //   행 박스 min-h-0 · gap-4 · p-5 / 좌측 그룹 gap-3 / 체크박스 h-6 w-6 +
                    //   체크 아이콘 0.9375rem / 라벨 text-[1.5rem] leading-[1.9375rem] +
                    //   라벨 표현 전환(shortLabel↔상품명 전문) / '추천' 배지 inline-block /
                    //   금액 블록 w-auto + leading-[1.9375rem] / 정가 취소선 20px w400 lh28 /
                    //   금액 한 줄 표현(hidden)↔배지·금액 분리 표현(flex).
                    // 라벨만 옮기고 금액을 sm 에 두면 같은 행에서 폭을 나눠 쓰는 두 블록의 크기가
                    // 640~1023 에서 어긋나므로 반드시 한 세트로 움직여야 한다.
                    // 이 button 밖(서비스명 h2 · 자세히보기/셰브론 · 설명문 · 단일선택 안내 ·
                    // 컨테이너 패딩 · 요약바)은 접힘과 무관하고 각자 sm 근거가 따로 있어 손대지 않았다.
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: 아래 주석대로 재클릭 시 선택 해제되는 의도적 비-네이티브 동작이다 — 네이티브 radio input은 클릭으로 해제할 수 없어 이 상품을 "건너뛴다" 표현이 불가능해진다.
                      <button
                        type="button"
                        key={product.id}
                        // role="radio" + aria-checked — 위 radiogroup 주석 참고. posinset/setsize
                        // 는 명시하지 않는다: DOM 상 radiogroup의 직계 자식이라 브라우저/AT가
                        // 자동으로 "N개 중 M번째"를 계산한다(가상화·비직계 구조가 아니므로
                        // 수동 지정이 불필요하다).
                        // 클릭으로 선택 해제(toggle)가 되는 건 네이티브 radio 관행과 다르다 —
                        // 여기 5개 서비스는 전부 "안 사도 되는" 선택형 상품이라 "이 서비스는
                        // 건너뛴다"를 표현할 방법이 필요했고, 그게 기존부터 있던 재클릭
                        // 해제였다(이번 라운드에서 새로 만든 동작이 아니다). 화살표 키 이동은
                        // 아래 handleRadioKeyDown 에서 이동=선택이라 매번 그룹 안 어딘가는
                        // 선택된 상태가 되지만, 클릭/스페이스는 여전히 토글이라 "전부 해제"도
                        // 가능하다 — 의도적 절충이며 aria-checked 는 실제 상태를 그대로
                        // 반영하므로 AT 에 거짓 정보를 주지 않는다.
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={isRovingTabStop ? 0 : -1}
                        onClick={() => toggle(service.key, product.id)}
                        onKeyDown={(e) =>
                          handleRadioKeyDown(
                            e,
                            service.key,
                            service.products,
                            index,
                          )
                        }
                        className={`flex min-h-[4rem] w-full items-center justify-between gap-5 rounded-2xl border p-[0.6875rem] text-left transition lg:min-h-0 lg:gap-4 lg:p-5 ${
                          isSelected
                            ? "border-accent bg-surface-info ring-1 ring-accent/30"
                            : "border-line bg-white hover:border-ink-sub"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2 lg:gap-3">
                          {/* 인디케이터 — 이번 라운드에서 정사각 체크박스(rounded-md + 흰
                            체크 글리프) → 원형 라디오(rounded-full + 내부 dot)로 바꿨다.
                            시각도 role="radio" 의미론과 맞추려는 것이다 — 체크박스 모양은
                            "여러 개 고를 수 있다"는 낡은 어포던스를 남기고, role/aria 만
                            바꾸면 마우스 사용자는 여전히 체크박스로 본다.
                            박스 크기(390 16px / lg 24px)와 그 근거는 그대로다 — 아래 크기
                            산식은 outer 박스 치수에 대한 것이라 원형으로 바꿔도 무효화되지
                            않는다(rounded-md → rounded-full 은 폭/높이에 영향이 없다):
                            390 좌측 그룹 예산 = 행 inner 폭 − 좌↔우 gap 20 − 금액블록 126.
                            전역 컨텐츠 규약(px-5)에서 390 컨테이너 inner = 350 이므로
                            행 inner = 350 − border 1×2(2) − 패딩 11×2(22) = 326
                            (border 를 빼는 이유: src/index.css:5 의 * { box-sizing: border-box }
                             때문에 행의 350px 안에 테두리 2px 이 포함된다.)
                            → 좌측 그룹 326 − 20 − 126 = 180px, 라벨 몫은 180 − 인디케이터 16
                            − gap 8 = 156px 로 실측 최장 '[12개월 30회 이용권]' 112.8px 을
                            넉넉히 덮는다(과거 px-10 시절 inner 310 에서는 라벨 몫이 116px
                            뿐이라 인디케이터를 16px 로 줄이는 것이 폭 제약이기도 했다.
                            규약 전환으로 그 제약은 사라졌고, 16px 은 이제 순수하게 390 시안
                            실측 근거로만 남는다). 인디케이터를 키우면 이 예산이 준다.
                            내부 dot 은 체크 글리프와 달리 "박스 테두리를 덮지 않게" 맞출
                            이유가 없다(글리프처럼 모서리가 있는 형태가 아니라 원 안의 원이라
                            여백이 나면 오히려 정상 라디오 모양이다) — outer 대비 50%
                            비율(8/16, 12/24)로 두 밴드 동일 비율을 유지했다. */}
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition lg:h-6 lg:w-6 ${
                              isSelected
                                ? "border-accent bg-white"
                                : "border-line bg-white"
                            }`}
                          >
                            {isSelected && (
                              <span className="h-2 w-2 rounded-full bg-accent lg:h-3 lg:w-3" />
                            )}
                          </span>
                          {/* 1023 이하는 대괄호 구간만(shortLabel), lg 이상은 상품명 전문
                            (1920 시안 1882-10810 / 1280 시안 1882-15190).
                            한국어 상품명이 어절 중간에서 끊기지 않도록 truncate 대신 break-keep.
                            390 타이포는 시안 실측(1882:16307 라벨 TEXT 110×20)대로
                            13px(0.8125rem) / lh 20px(1.25rem) / weight 500 이다. 15px 이면
                            '[12개월 30회 이용권]' 이 110px 을 넘어 2줄로 접혔다.
                            lg 이상은 시안(1280 = 1882:15190 / 1920 = 3408:4832) 실측
                            24px w500 lh31 #525252 ls-0.48 다(rem: 24px = 1.5rem / lh31 = 1.9375rem).
                            전환점이 sm 이 아니라 lg 인 이유는 위 button 주석의 ★ 항목 참고 —
                            shortLabel↔전문 전환도 라벨 크기와 한 세트라 같이 옮겼다. 전환점만
                            옮기고 표현을 sm 에 남기면 640~1023 이 '13px + 상품명 전문' 이라는
                            어느 시안에도 없는 제3의 상태가 된다(390 은 13px+shortLabel,
                            1280 은 24px+전문). shortLabel 의 근거(서비스명이 바로 위 h2 에 이미
                            있어 전문은 중복)는 폭에 의존하지 않으므로 1023 까지 그대로 성립한다.
                            ls 는 양쪽 밴드 모두 -0.02em(390 -0.26/13, 1280·1920 -0.48/24) →
                            단일 클래스. 390 은 ls 가 붙어 글자폭이 오히려 줄어드므로 확정
                            예산(라벨 몫 156px, 최장 라벨 112.8px)에 여유가 더 생긴다.
                            색은 양쪽 시안 모두 #525252 = ink 다(기존 ink-title 은 근거 없음). */}
                          <span className="break-keep text-[0.8125rem] font-medium leading-[1.25rem] tracking-[-0.02em] text-ink lg:text-[1.5rem] lg:leading-[1.9375rem]">
                            <span className="lg:hidden">{shortLabel}</span>
                            <span className="hidden lg:inline">
                              {product.name}
                            </span>
                          </span>
                          {/* '추천' 배지는 1280·1920 시안에만 있고 390 시안(1882-16307, 1882-16017)
                            에는 0건이라 1023 이하에서 숨긴다(노출 전환점도 라벨과 한 세트로
                            sm → lg 로 옮겼다 — 배지 타이포는 BP 고정 16px 이라 13px 라벨 옆에
                            남겨 두면 배지가 라벨보다 큰 위계 역전이 생기고, 390 확정 표현에는
                            애초에 배지가 없다). 배지 개수는 BP 별로 다르다 —
                            1920 은 1882-10810 이 2건, 3408-4832 가 3건이고 1280(1882-15190,
                            1882-15614)은 3건이다. 어느 상품에 붙는지는 시안이 아니라 DB
                            (products.recommended)가 정본이라 개수 차이는 코드에 반영하지 않는다. */}
                          {/* 배지 타이포는 시안 인벤토리대로 16px w500 #ffffff
                            (rem: 16px = 1rem). 기존 11px w700 은 시안에 없는 값이다.
                            base 값은 부모가 hidden lg:inline-block 이라 렌더되지 않는다.
                            (참고: 시안 텍스트 3408:4945 의 폭 28px 은 CJK 2자 × 14px 에 더
                            가까워 14px 일 여지가 있으나, 같은 프레임의 텍스트 노드들이
                            고정 크기로 리사이즈돼 있어 폭/높이로는 판정이 불가하다 →
                            REST 스타일 실측인 인벤토리 값 16px 을 따른다.) */}
                          {product.recommended && (
                            <span className="hidden shrink-0 rounded-md bg-accent px-2 py-0.5 text-[1rem] font-medium text-white lg:inline-block">
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
                          lg 이상은 w-auto 로 풀고 lh 만 시안 판매가 값(31px = 1.9375rem)으로
                          바꾼다 — 기존 leading-tight(1.25배)는 24px 에서 30px 로 시안 31 과
                          어긋나고, 정가 줄은 아래에서 lh28 로 따로 덮는다. 결과 블록 높이
                          28 + 31 = 59px 로, 시안 1920 금액 블록(3408:4910 = 67×60,
                          두 줄 28 + gap 4)과 1px 차다.
                          전환점이 sm → lg 로 옮겨진 이유는 위 button 주석의 ★ 항목 참고. 126px
                          고정폭이 1023 까지 유지되지만, 그 구간은 아래 '한 줄' 표현(13px)을 쓰고
                          최장 문구 '40%할인 180,000원' 이 122.6px 이라 126 예산 안에 들어온다. */}
                        <span className="flex w-[7.875rem] shrink-0 flex-col items-end leading-[1.25rem] lg:w-auto lg:leading-[1.9375rem]">
                          {/* 정가 취소선 — 390 12px w500 lh20 #d7d7d7 ls-0.24 /
                            1920 20px w400 lh28 #d9d9d9 ls-0.4.
                            #d9d9d9 는 토큰이 없어 가장 가까운 line(#d7d7d7, 차이 2)로 쓴다 —
                            390 시안이 이미 정확히 #d7d7d7 이라 두 밴드가 한 토큰으로 수렴한다.
                            390 lh20 은 부모의 leading-[1.25rem] 상속으로 이미 맞다.
                            rem: 12px = 0.75rem / 20px = 1.25rem / lh28 = 1.75rem.
                            ls 는 양쪽 -0.02em(-0.24/12, -0.4/20).
                            기존 12px w400 #808080(ink-sub) 은 취소선인데도 본문 보조색과 같아
                            '비활성' 위계가 드러나지 않았다. */}
                          {hasDiscount && (
                            <span className="text-[0.75rem] font-medium tracking-[-0.02em] text-line line-through lg:text-[1.25rem] lg:font-normal lg:leading-[1.75rem]">
                              {formatKRW(product.listPrice)}
                            </span>
                          )}
                          {/* 1023 이하(390 확정 표현): 할인 라벨과 금액이 한 줄 단일 텍스트
                            ('약 11%할인 80,000원').
                            lg 이상: 시안(1920 = 1882-10810 / 1280 = 1882-15190)대로 라벨(blue)과
                            금액을 두 요소로 분리. 전환점 이동 근거는 위 button 주석 ★ 항목. */}
                          {/* 390 금액 블록 폭이 시안대로 126px 이라 이 한 줄이 126px 안에 들어가야
                            한다. 최장 문구 '40%할인 180,000원' 실측 폭은 15px 에서 141.5px 로
                            126 을 넘어 2줄이 됐다(행 높이 86px). 13px 이면 141.5×13/15 ≈ 122.6px
                            로 1줄이며, 라벨과 같은 13px 이라 390 타이포 단계도 일관된다.
                            14px 은 141.5×14/15 ≈ 132px 로 여전히 초과.
                            이 span 자체가 lg:hidden(1023 이하 전용)이고, lg 값은 아래 lg:flex
                            블록이 따로 정한다. */}
                          {/* 390 확정 타이포(13px/lh20/w500 #525252 ls-0.26)를 그대로 쓴다.
                            기존 w900 → w500, ink-title → ink 로만 내렸다. 무게가 줄고 ls 가
                            음수라 최장 문구('40%할인 180,000원') 폭은 기존 122.6px 보다 더
                            줄어들어 126px 예산이 깨질 위험이 없다. */}
                          <span className="text-[0.8125rem] font-medium tracking-[-0.02em] text-ink lg:hidden">
                            {compactBadge
                              ? `${compactBadge} ${formatKRW(product.price)}`
                              : formatKRW(product.price)}
                          </span>
                          <span className="hidden items-center gap-2 lg:flex">
                            {/* 할인 배지 — 시안 1920 24px w500 #013262 ls-0.48
                              (텍스트 3408:4915 '10% 할인' 폭 92px 이 24px 상당으로 교차확인).
                              색은 primary(#013262) = 시안 강조·할인색이다. 기존 13px w700
                              accent(#0b84fd)는 크기·무게·색 셋 다 이탈이었다.
                              lh 는 부모의 lg:leading-[1.9375rem](31px)을 상속한다. */}
                            {product.badge && (
                              <span className="text-[1.5rem] font-medium tracking-[-0.02em] text-primary">
                                {product.badge}
                              </span>
                            )}
                            {/* 판매가 — 시안 1920 24px w500 lh31 #525252 ls-0.48.
                              기존 15px w900 ink-title 대비 "크고 가볍게"로 되돌린 것이다. */}
                            <span className="text-[1.5rem] font-medium tracking-[-0.02em] text-ink">
                              {formatKRW(product.price)}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 단일선택 안내 — 390 12px w500 lh17 #525252(ls 없음) /
                  1920 18px w500 lh25 #525252 ls-0.36(= -0.02em)
                  (시안 텍스트 3408:4956 이 1209×25 로 lh25 교차확인).
                  rem: 12px = 0.75rem / lh17 = 1.0625rem / 18px = 1.125rem / lh25 = 1.5625rem.
                  ls 는 1920 만 준다 — 390 시안에는 없다.
                  색은 ink(#525252). 기존 12px w400 ink-sub(#808080) 는 시안보다 흐렸다.
                  문구 자체는 radiogroup 전환 후에도 완전히 없애지 않았다 — 근거는
                  src/data/pricingCatalog.js 의 SINGLE_SELECT_NOTICE 주석 참고(마우스만
                  쓰는 사용자에겐 원형 인디케이터만으로 "단일선택"이 자명하지 않다).
                  중복(같은 말 2번)만 제거했고 문장은 1개로 줄었다.
                  조건 service.products.length > 1 은 이번에 손대지 않았다 — 학습진단처럼
                  플랜이 1개뿐인 서비스는 애초에 고를 대상이 하나뿐이라 "선택 규칙"
                  자체가 성립하지 않고, 그래서 이 조건 하나로 5개 서비스 블록 전부가
                  일관되게 처리된다(학습진단만 안내문이 없는 건 예외 분기가 아니라 이
                  조건의 자연스러운 결과다 — 별도 정리가 필요한 비일관성이 아니다). */}
                {service.products.length > 1 && (
                  <p className="mt-4 text-[0.75rem] font-medium leading-[1.0625rem] text-ink sm:text-[1.125rem] sm:leading-[1.5625rem] sm:tracking-[-0.02em]">
                    {SINGLE_SELECT_NOTICE}
                  </p>
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
          // (sm+ 고정 바의 총 할인금액도 1280 시안 실측 #013262 확인 후 primary 로 정정해
          //  두 요약 UI 의 색 역할이 이제 일치한다 — :587 주석 참고.)
          <div className="bg-surface-info px-5 py-7 sm:hidden">
            <dl className="space-y-2.5 text-[0.875rem]">
              <div className="flex items-baseline justify-between gap-4">
                {/* 390 요약 밴드(1882:16017)는 스타일 인벤토리에 항목이 없어 크기(14px)는
                    현행을 유지하고, 시안 규약에서 확실히 벗어난 것만 되돌린다:
                    값 색 ink-title(#181d24) → ink(#525252, 시안 본문 기본색). */}
                <dt className="font-medium text-ink-sub">총 판매가</dt>
                <dd className="font-bold text-ink">{formatKRW(listTotal)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-medium text-ink-sub">총 할인 금액</dt>
                {/* 390 시안(1882-16017)만 할인금액에 마이너스 부호가 붙는다('-273,600원').
                    요약 바를 실제로 그린 sm 이상 시안은 1280 = 1882-15190 과
                    1920 = 3408-4832 이고 둘 다 '151,400원' 처럼 부호 없이 표기하므로
                    아래 고정 바는 현행 유지. (1882-10810 에는 요약 바 자체가 없다 —
                    '총 판매가'·'총 할인금액' 문자열이 0건이라 근거로 쓸 수 없다.) */}
                <dd className="font-bold text-primary">
                  {discountTotal > 0
                    ? `-${formatKRW(discountTotal)}`
                    : formatKRW(0)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-medium text-ink-sub">총 결제 금액</dt>
                {/* w900 은 시안 무게 범위(w400~w700) 밖이라 w700 으로 내린다. */}
                <dd className="text-[1rem] font-bold text-primary">
                  {formatKRW(totalPrice)}
                </dd>
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
          {/* 요약 바 내부 컨테이너는 본문 컨테이너(:134)와 **폭 토큰 `max-w-content` +
              좌우 패딩 `px-5 sm:px-8`** 이 같아야 한다 — 클래스 문자열 전체가 같은 것은
              아니다(이쪽은 flex/items-center/justify-between/gap-6/py-5 가 더 붙고, 본문은
              pb-16 pt-10 sm:pb-40 을 쓴다). 근거는 위 본문 컨테이너 주석 참고.
              폭만 맞추고 좌우 패딩이 다르면 요약바 텍스트가 플랜 행보다 좌우로 밀려
              들어가므로, 폭 토큰과 좌우 패딩은 반드시 함께 수정해야 한다.
              base `px-5` 는 부모가 hidden sm:block(:543)이라 렌더되지 않는다 — 실제로
              적용되는 건 sm 쪽 px-8 뿐이다. 그래도 남겨 두는 이유는 본문의 좌우 패딩
              토큰과 문자 단위로 대조할 수 있게 하려는 것이고, sm 미만에서는 부모가
              숨기므로 무해하다. */}
          <div className="mx-auto flex w-full max-w-content items-center justify-between gap-6 px-5 py-5 sm:px-8">
            {/* 부모가 hidden sm:block 이라 base 값은 절대 적용되지 않는다 → 단일 gap-16. */}
            <div className="flex items-center gap-16">
              {/* 요약바 라벨 — 시안 1920 16px w500 lh22 (텍스트 3408:5176 '총 판매가' 60×22 로
                  lh22 교차확인) / 1280 시안(1882:15190·1882:15614) 실측도 16px w500 이라 크기·무게가
                  두 밴드에서 일치한다. rem: 16px = 1rem / lh22 = 1.375rem.
                  ls 는 시안 인벤토리에 없어 넣지 않는다.
                  색 — 1280 실측은 라벨·'총 판매가' 값 모두 #36393e 로 팔레트에 토큰이 없다.
                  최근접 토큰을 실제로 계산해 골랐다(#36393e = rgb(54,57,62)):
                    · ink #525252 = rgb(82,82,82) → 채널차 (28,25,20), |Δ| 합 73, 유클리드
                      √(784+625+400) = √1809 ≈ 42.5
                    · ink-title #181d24 = rgb(24,29,36) → 채널차 (30,28,26), |Δ| 합 84,
                      유클리드 √(900+784+676) = √2360 ≈ 48.6
                  두 지표 모두 ink 가 가깝다(42.5 < 48.6) → 라벨·총 판매가 값 둘 다 ink 유지.
                  새 hex 를 하드코딩하지 않는다(tailwind.config.js 수정 금지).
                  값 크기·무게 — 1280 시안 실측 24px w500 이다(직전 라운드의 20px w600 은 시안
                  노드 폭 역산으로 추정한 값이라 폐기했다. 역산 기준값 자체가 틀렸다).
                  rem: 24px = 1.5rem, 무게 font-medium.
                  값 lh — 시안 요약바의 라벨/값 프레임 높이 기록이 lh20~3 대로 비정상이라 폭·높이
                  역산을 쓰지 않는다. 대신 같은 시안이 24px 텍스트에 실제로 쓰는 lh31
                  (1.9375rem — 이 파일 플랜 라벨·판매가의 sm 값과 동일)을 재사용했다.
                  비율 31/24 ≈ 1.29 로 leading-tight(1.25)~normal(1.5) 사이이고,
                  블록 높이 = 라벨 lh22 + mt-1(4) + 값 31 = 57px < 컨테이너 내부 높이
                  (py-5 = 20+20 을 뺀 나머지)라 라벨과 값이 겹치지 않는다.
                  결과 바 높이 = 40 + 57 = 97px (CTA 쪽은 py-3.5×2 + lh28 = 56px 로 더 낮다). */}
              <div className="text-center">
                <p className="text-[1rem] font-medium leading-[1.375rem] text-ink">
                  총 판매가
                </p>
                <p className="mt-1 text-[1.5rem] font-medium leading-[1.9375rem] text-ink">
                  {formatKRW(listTotal)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[1rem] font-medium leading-[1.375rem] text-ink">
                  총 할인 금액
                </p>
                {/* 총 할인금액 값 색 — 1280 시안(1882:15190) 실측 #013262 = primary 다.
                    직전 라운드의 accent(#0B84FD, 옛 blue-600 승계값)는 실측 근거가 없던 잔존값이라
                    정정했다. 이제 390 밴드(:520, 390 시안 실측색이 네이비)와 sm+ 가 같은 토큰을
                    쓴다 — 같은 정보가 폭에 따라 다른 색이던 문제가 해소된다. */}
                <p className="mt-1 text-[1.5rem] font-medium leading-[1.9375rem] text-primary">
                  {formatKRW(discountTotal)}
                </p>
              </div>
            </div>
            {/* CTA 는 모바일 밴드와 동일하게 accent. 그림자 틴트도 accent(#0B84FD) rgb 로 맞춘다.
                타이포는 시안 1920 실측 20px w500 lh28 #ffffff ls-0.4(= -0.02em).
                rem: 20px = 1.25rem / lh28 = 1.75rem. 기존 15px w700 대비 "크고 가볍게". */}
            <button
              type="button"
              onClick={goCheckout}
              className="shrink-0 rounded-lg bg-accent px-8 py-3.5 text-[1.25rem] font-medium leading-[1.75rem] tracking-[-0.02em] text-white shadow-[0_0.625rem_1.625rem_rgba(11,132,253,0.28)] transition hover:brightness-95"
            >
              {formatKRW(totalPrice)} 결제하기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
