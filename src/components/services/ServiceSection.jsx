import { SECTION_HEADING_CLASS } from './serviceTokens';

// 섹션 껍데기 — <section> + 정본 컨테이너 + h2 헤딩.
//
// (a) 출처: InDepthResearch.jsx 의 7개 섹션(ProcessSection ~ FaqSection)이 문자 그대로
//     공유하던 `<section className="bg-white pt-16 sm:pt-20 lg:pt-[N]">` +
//     `<div className="mx-auto w-full max-w-content px-5 sm:px-8">` + h2 구조를 그대로 뽑았다.
//     4페이지의 전 섹션이 이 컴포넌트를 통해서만 렌더된다.
//
// (b) 페이지별 차이 흡수:
//     - className        : 경계별로 다른 lg pt/pb 만 받는다(예: 'lg:pt-[10rem]').
//                          섹션 간 갭은 앞 섹션 pb + 뒤 섹션 pt 로 계산된 경계별 실측값이라
//                          공통값을 잡지 않고 페이지가 리터럴로 넘긴다.
//                          배경색・컨테이너는 여기서 바꾸지 않는다.
//     - containerClassName: 컨테이너 추가 클래스. 실사용은 ServicePricingSection 의
//                          'text-center' 1건뿐이다.
//     - heading          : 2-tone 강조가 필요하면 JSX 조각을 넘긴다
//                          (예: <>이런 학생에게 <span className="text-[#013262]">…</span></>).
//                          생략하면 h2 자체를 렌더하지 않는다.
//
// 배경(bg-white)과 모바일/sm pt(pt-16 sm:pt-20)는 컴포넌트가 고정한다 — 기준 페이지는
// 히어로~마지막 전 구간이 bg-white 단일이며, 배경 밴드(#F5F5F7)는 이번 수렴으로 폐기됐다.
export default function ServiceSection({
  heading,
  className = '',
  containerClassName = '',
  children
}) {
  return (
    <section className={`bg-white pt-16 sm:pt-20 ${className}`}>
      <div className={`mx-auto w-full max-w-content px-5 sm:px-8 ${containerClassName}`}>
        {heading ? <h2 className={SECTION_HEADING_CLASS}>{heading}</h2> : null}
        {children}
      </div>
    </section>
  );
}
