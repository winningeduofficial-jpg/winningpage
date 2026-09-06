// 이용권 구매 섹션(Supabase useProducts 의존, loading / error / 정상 3분기).
//
// (a) 출처: 수행평가 PricingSection + 목표관리 PricingSection 통합.
//     기준 페이지(InDepthResearch)에 가격 섹션이 없으므로 **수행평가 쪽을 기준으로 삼았다** —
//     행 폭/높이/패딩/배지 크기/할인 블록 gap 이 전부 실측 근거를 가진 단일 규격이고,
//     추천 배지가 고정 크기이며(목표관리는 px-3 py-1.5 임의값), 안내문·CTA 간격이 명시돼 있다.
//     목표관리의 rounded-2xl 행 / md:h-26.5 / bg-accent 배지 / rounded-perf-modal CTA 는 폐기.
//     섹션 껍데기는 ServiceSection 을 재사용한다.
//
// (b) 페이지별 차이 흡수:
//     - serviceKey : useProducts 인자('suhaeng' | 'goal').
//     - heading    : h2 문구. 두 페이지가 유일하게 다른 카피라 prop 으로 받는다.
//     - cta        : { label, to?, onClick? }. to 가 있으면 <Link to>(목표관리 '/pricing'),
//                    없으면 <button onClick>(수행평가 openPaidServiceOrAlert 콜백).
//     - className  : 섹션 패딩. ServiceSection 으로 그대로 전달되며 3분기 모두 동일 적용.
//     - id         : 인페이지 앵커 타깃(ServiceSection 의 id 패스스루). 로딩·에러 분기에도
//                    똑같이 붙인다 — 상품 조회가 늦거나 실패해도 `#pricing` 이동은
//                    도착해야 하기 때문이다(수행평가 랜딩의 이용권 미보유 안내 경로).
//
// 로딩 문구·에러 문구·'다시 시도'·'추천' 배지 텍스트는 두 페이지가 문자 그대로 동일하므로
// 컴포넌트 내부에 원문 그대로 고정한다.
// 하단 결제 안내 문단("이 페이지에서는 결제가 진행되지 않으며...")은 QA 행 86(2026-09-06)
// 지적으로 삭제했다 — CTA를 누르면 어차피 이동한 페이지에서 결제가 이뤄지는 게 자명해
// 불필요한 문구였다(두 서비스 공통 적용). 상품 카드 좌측의 체크 아이콘 장식 배지도 같은
// 이유(선택 불가능한 정보 카드인데 체크박스처럼 보임)로 함께 삭제했다.
//
// [가격 정본 안내] 가격은 Supabase `products` 테이블에서 조회한다. 정본은 DB이며 프론트에는
// 가격을 하드코딩하지 않는다.
//
// 공통 정정: 보더 #D9D9D9 → 정본 토큰 #D7D7D7(행 보더·체크박스 배경·정가 취소선 색까지).
// 브레이크포인트 md: → lg: 통일. 텍스트의 3단 반응형 확대
// (text-[1.0625rem] sm:text-[1.375rem] md:text-[1.125rem] 형태 = 폰트에 배율을 적용한 흔적,
// 3원칙 1번 위반)는 전부 단일값 text-[1.125rem] 로 정리했다.
// CTA 는 인라인 style={{ backgroundColor: BRAND_NAVY }} 대신 클래스 리터럴 bg-primary 를 쓴다.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { formatKRW } from "@/data/pricingCatalog";
import { useProducts } from "@/lib/products";
import ServiceSection from "./ServiceSection";

type ServicePricingCta = {
  label: string;
  to?: string;
  onClick?: () => void;
};

type ServicePricingSectionProps = {
  serviceKey: string;
  heading?: ReactNode;
  cta: ServicePricingCta;
  id?: string;
  className?: string;
};

export default function ServicePricingSection({
  serviceKey,
  heading,
  cta,
  id,
  className = "",
}: ServicePricingSectionProps) {
  const { services, loading, error, refetch } = useProducts(serviceKey);
  const products = services[0]?.products || [];
  // exactOptionalPropertyTypes: ServiceSectionProps.id는 명시적 undefined를 허용하지 않으므로,
  // 값이 있을 때만 프롭 자체를 넣는다(동작은 동일). 세 분기(loading/error/정상)가 공유한다.
  const idProp = id !== undefined ? { id } : {};

  if (loading) {
    return (
      <ServiceSection
        {...idProp}
        className={className}
        containerClassName="text-center"
        heading={heading}
      >
        <p className="mt-10 text-[1rem] font-medium text-[#767676] sm:mt-12 lg:mt-22.5">
          이용권 정보를 불러오는 중입니다.
        </p>
      </ServiceSection>
    );
  }

  if (error || products.length === 0) {
    return (
      <ServiceSection
        {...idProp}
        className={className}
        containerClassName="text-center"
        heading={heading}
      >
        <p className="mt-10 text-[1rem] font-medium text-red-600 sm:mt-12 lg:mt-22.5">
          요금 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={refetch}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-[0.9375rem] border border-accent px-6 text-[0.9375rem] font-semibold text-primary transition hover:bg-[#F1F8FF]"
        >
          다시 시도
        </button>
      </ServiceSection>
    );
  }

  // 안내문→CTA gap — QA 지적으로 하단 구매 영역 전반의 간격을 좁혔다(기존 lg:mt-12.25).
  // 색상 — 2026-09-02 QA(시트 행 264 "이용권 구매하기 버튼 컬러 변경 필요"): 네이비 채움에
  // accent 테두리를 두르던 조합을 버리고, 실제 결제 CTA(PricingSelling "결제하기")와 같은
  // accent 채움(#0B84FD)·hover brightness-95 로 통일했다. 구매 동선 버튼은 accent, 히어로
  // "지금 시작하기"(시안 2967:9261)는 네이비 — 역할별 색을 나눈다. 이 컴포넌트를 쓰는
  // 목표관리·심화탐구 랜딩에도 같이 적용된다.
  const ctaClass =
    "mt-6 inline-flex h-14 w-full max-w-57.5 items-center justify-center rounded-[0.9375rem] bg-accent px-8 text-[0.9375rem] font-semibold text-white transition hover:brightness-95 lg:mt-8 lg:h-13 lg:w-57.5 lg:px-0";

  return (
    <ServiceSection
      {...idProp}
      className={className}
      containerClassName="text-center"
      heading={heading}
    >
      {/* 헤딩→리스트 gap — QA 지적으로 기존 lg:mt-22.5(약 90px)에서 좁혔다. */}
      <div className="mt-8 flex flex-col gap-2.5 text-left sm:mt-10 lg:mt-14 lg:gap-2">
        {products.map((product) => {
          // null/undefined일 때 이전에도 비교식이 항상 false였던 것과 동일한 결과.
          const hasDiscount =
            product.listPrice != null &&
            product.price != null &&
            product.listPrice > product.price;
          return (
            /* 행 폭 1209 × 0.766 ≈ 926px, 컨테이너(최대 1100px) 안에서 lg:mx-auto 중앙 정렬.
               행 높이 119 × 0.766 ≈ 91px, 패딩 상하 21px / 좌우 25px, radius 12 = rounded-xl. */
            <div
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-6 py-6 sm:px-8 lg:mx-auto lg:h-22.75 lg:w-full lg:max-w-231.5 lg:px-6.25 lg:py-5.25"
            >
              {/* QA 행 86(2026-09-06) — 선택 불가능한 정보 카드인데 체크박스처럼 보이는
                  장식용 체크 아이콘 배지를 삭제했다. */}
              <span className="flex items-center gap-3.75">
                <span className="text-[1.125rem] font-medium leading-[1.4] tracking-[-0.02em] text-ink">
                  {product.name}
                </span>
                {product.recommended && (
                  /* 추천 배지 — 52×32 × 0.766 → 40×25, radius 9px, 텍스트 13px. */
                  <span className="flex h-6.25 w-10 shrink-0 items-center justify-center rounded-[0.5625rem] bg-accent text-[0.8125rem] font-medium text-white">
                    추천
                  </span>
                )}
              </span>
              <span className="flex flex-col items-end">
                {hasDiscount ? (
                  /* 정가(취소선)↔할인 블록 gap 4 × 0.766 ≈ 3px. */
                  <span className="flex flex-col items-end gap-0.75">
                    <span className="text-[0.9375rem] font-normal leading-[1.4] tracking-[-0.02em] text-line line-through">
                      {formatKRW(product.listPrice)}
                    </span>
                    <span className="flex items-center gap-4">
                      {product.badge && (
                        <span className="text-[1.125rem] font-medium tracking-[-0.02em] text-primary">
                          {product.badge}
                        </span>
                      )}
                      <span className="text-[1.125rem] font-medium leading-[1.4] tracking-[-0.02em] text-ink">
                        {formatKRW(product.price)}
                      </span>
                    </span>
                  </span>
                ) : (
                  /* 할인 없는 상품 — 가격만, 라벨과 동일 타이포 */
                  <span className="text-[1.125rem] font-medium leading-[1.4] tracking-[-0.02em] text-ink">
                    {formatKRW(product.price)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {serviceKey === "suhaeng" && (
        <p className="mt-4 break-keep text-left text-[0.875rem] font-medium text-ink lg:mt-2.25 lg:mx-auto lg:max-w-231.5">
          1회 = 수행평가 1건 (주제 추천 → 설계 리포트 → 평가 리포트 전 과정)
        </p>
      )}

      {/* CTA는 inline-flex라 부모(ServiceSection의 containerClassName="text-center")의
          text-center를 그대로 상속해 이미 가운데 정렬된다 — 별도 처리가 필요 없다. */}
      {cta.to ? (
        <Link to={cta.to} className={ctaClass}>
          {cta.label}
        </Link>
      ) : (
        <button type="button" onClick={cta.onClick} className={ctaClass}>
          {cta.label}
        </button>
      )}
    </ServiceSection>
  );
}
