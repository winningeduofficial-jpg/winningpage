import { SECTION_HEADING_CLASS } from './serviceTokens';

// surface: 리터럴 lookup — Tailwind JIT 는 `bg-[${surface}]` 식 템플릿 조립을 스캔하지
// 못해 클래스가 조용히 사라진다. 미등록 값은 폴백 없이 undefined 로 두어 즉시 눈에 띄게
// 깨뜨린다(ServiceStepCards STEP_COLS / ServiceTestimonials TESTIMONIAL_COLS 와 동일 규약).
const SECTION_SURFACE = {
  white: 'bg-white',
  gray: 'bg-[#F4F4F6]'
};

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
//     - surface          : 섹션 배경 톤. 기본 'white'(bg-white)는 4페이지 기준과 문자 동일.
//                          'gray'(bg-[#F4F4F6])는 콜멘토 §4 회색 밴드 전용 확장이다.
//     - id               : 인페이지 앵커 타깃이 필요한 섹션만 지정(콜멘토 #callmentor-steps 1건).
//                          스타일과 무관한 순수 패스스루다.
//
// 모바일/sm pt(pt-16 sm:pt-20)는 컴포넌트가 고정한다 — 4페이지 기준은 여전히 bg-white
// 단일이며, gray 는 콜멘토 전용 확장이다.
export default function ServiceSection({
  heading,
  id,
  surface = 'white',
  className = '',
  containerClassName = '',
  children
}) {
  return (
    <section id={id} className={`${SECTION_SURFACE[surface]} pt-16 sm:pt-20 ${className}`}>
      <div className={`mx-auto w-full max-w-content px-5 sm:px-8 ${containerClassName}`}>
        {heading ? <h2 className={SECTION_HEADING_CLASS}>{heading}</h2> : null}
        {children}
      </div>
    </section>
  );
}
