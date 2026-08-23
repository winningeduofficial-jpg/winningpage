import type { ReactNode } from "react";
import {
  PREMIUM_SECTION_HEADING_CLASS,
  PREMIUM_SECTION_SUB_CLASS,
} from "./premiumTokens";

// 프리미엄 섹션 2~10 공용 헤딩+서브 블록. ServiceSection 의 heading 슬롯과 달리
// 프리미엄 시안은 헤딩이 항상 중앙정렬 + 서브 카피를 동반하므로(서비스 랜딩은 children
// 첫 <p>로 서브를 흡수) 이 둘을 한 컴포넌트로 묶는다. 골드 강조(예: "A 프로그램")가
// 필요한 섹션은 heading 에 <span className="text-gold">…</span> 조각을 넘긴다.
type PremiumSectionHeadingProps = {
  heading: ReactNode;
  sub?: ReactNode;
  className?: string;
  headingClassName?: string;
  subClassName?: string;
};

export default function PremiumSectionHeading({
  heading,
  sub,
  className = "",
  headingClassName = PREMIUM_SECTION_HEADING_CLASS,
  subClassName = PREMIUM_SECTION_SUB_CLASS,
}: PremiumSectionHeadingProps) {
  return (
    <div className={className}>
      <h2 className={headingClassName}>{heading}</h2>
      {sub ? <p className={`mt-3 ${subClassName}`}>{sub}</p> : null}
    </div>
  );
}
