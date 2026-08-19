import { SECTION_HEADING_CLASS } from "./serviceTokens";

// surface: 리터럴 lookup — Tailwind JIT 는 `bg-[${surface}]` 식 템플릿 조립을 스캔하지
// 못해 클래스가 조용히 사라진다. 미등록 값은 폴백 없이 undefined 로 두어 즉시 눈에 띄게
// 깨뜨린다(ServiceStepCards STEP_COLS / ServiceTestimonials TESTIMONIAL_COLS 와 동일 규약).
const SECTION_SURFACE: Record<string, string> = {
  white: "bg-white",
  gray: "bg-[#F4F4F6]",
  // 멘토신청 시안(Surface/05 #F9FAFB, docs/mentor-apply-spec.md §2·§6-1) 전용 톤.
  // 기존 'gray'(#F4F4F6)를 시안값으로 덮어쓰지 않는다 — 콜멘토 §4 회색 밴드가 그 값을 쓰고 있어
  // 바꾸면 다른 페이지가 조용히 회귀한다. #F9FAFB 는 tailwind surface.footer 토큰과 같은 값이라
  // 신규 hex 하드코딩 없이 토큰 클래스로 쓴다.
  softGray: "bg-surface-footer",
};

// 섹션 껍데기 — <section> + 정본 컨테이너 + h2 헤딩.
//
// (a) 출처: InDepthResearch.jsx 의 7개 섹션(ProcessSection ~ FaqSection)이 문자 그대로
//     공유하던 `<section className="bg-white pt-16 sm:pt-20 lg:pt-[N]">` +
//     `<div className="mx-auto w-full max-w-content px-5 sm:px-8">` + h2 구조를 그대로 뽑았다.
//     4페이지의 전 섹션이 이 컴포넌트를 통해서만 렌더된다.
//
// (b) 페이지별 차이 흡수:
//     - className        : 경계별로 다른 lg pt/pb 만 받는다(예: 'lg:pt-40').
//                          섹션 간 갭은 앞 섹션 pb + 뒤 섹션 pt 로 계산된 경계별 실측값이라
//                          공통값을 잡지 않고 페이지가 리터럴로 넘긴다.
//                          배경색・컨테이너는 여기서 바꾸지 않는다.
//     - containerClassName: 컨테이너 추가 클래스. 실사용은 ServicePricingSection 의
//                          'text-center' 1건뿐이다.
//     - heading          : 2-tone 강조가 필요하면 JSX 조각을 넘긴다
//                          (예: <>이런 학생에게 <span className="text-primary">…</span></>).
//                          생략하면 h2 자체를 렌더하지 않는다.
//     - surface          : 섹션 배경 톤. 기본 'white'(bg-white)는 4페이지 기준과 문자 동일.
//                          'gray'(bg-[#F4F4F6])는 콜멘토 §4 회색 밴드 전용 확장,
//                          'softGray'(#F9FAFB)는 멘토신청 전용 확장이다.
//     - eyebrow          : h2 위에 놓이는 아이브로 한 줄. 멘토신청 §2(`전국 소재 대학생`)처럼
//                          시안이 요구하는 섹션만 넘긴다. **생략하면 아무것도 렌더하지 않아
//                          기존 5개 사용처(InDepthResearch/PerformanceAssessment/SelfAssessment/
//                          GoalManagement/ServicePricingSection)의 출력이 문자 그대로 동일하다.**
//                          아이브로 타이포는 시안 공통값(16px Medium, primary #013262)을
//                          컴포넌트가 고정한다 — 페이지마다 달라진 전례가 없다.
//     - headingClassName : h2 클래스 교체. 기본값이 곧 기존 동작(SECTION_HEADING_CLASS)이다.
//                          멘토신청은 h2 위계가 두 가지(serviceTokens 의 MENTOR_HEADING_LG /
//                          MENTOR_HEADING_MD)라, 이 슬롯이 없으면 섹션이 heading prop 을 못 쓰고
//                          children 안에 자체 h2 를 다시 만들어야 한다(=중복 h2 위험).
//     - id               : 인페이지 앵커 타깃이 필요한 섹션만 지정(콜멘토 #callmentor-steps 1건).
//                          스타일과 무관한 순수 패스스루다.
//
// 모바일/sm pt(pt-16 sm:pt-20)는 컴포넌트가 고정한다 — 4페이지 기준은 여전히 bg-white
// 단일이며, gray/softGray 는 각각 콜멘토·멘토신청 전용 확장이다.
import type { ReactNode } from "react";

type ServiceSectionProps = {
  heading?: ReactNode;
  eyebrow?: string;
  id?: string;
  surface?: "white" | "gray" | "softGray";
  className?: string;
  containerClassName?: string;
  headingClassName?: string;
  children?: ReactNode;
};

export default function ServiceSection({
  heading,
  eyebrow,
  id,
  surface = "white",
  className = "",
  containerClassName = "",
  headingClassName = SECTION_HEADING_CLASS,
  children,
}: ServiceSectionProps) {
  return (
    <section
      id={id}
      className={`${SECTION_SURFACE[surface]} pt-16 sm:pt-20 ${className}`}
    >
      <div
        className={`mx-auto w-full max-w-content px-5 sm:px-8 ${containerClassName}`}
      >
        {/* 아이브로 ↔ 타이틀 간격 8px(0.5rem) — 멘토신청 시안 §2 실측. */}
        {eyebrow ? (
          <p className="mb-2 text-[1rem] font-medium leading-[1.4] text-primary">
            {eyebrow}
          </p>
        ) : null}
        {heading ? <h2 className={headingClassName}>{heading}</h2> : null}
        {children}
      </div>
    </section>
  );
}
