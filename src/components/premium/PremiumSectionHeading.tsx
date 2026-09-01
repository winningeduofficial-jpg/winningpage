import type { ReactNode } from "react";
import {
  PREMIUM_SECTION_HEADING_CLASS,
  PREMIUM_SECTION_HEADING_DARK_CLASS,
  PREMIUM_SECTION_SUB_CLASS,
  PREMIUM_SECTION_SUB_DARK_CLASS,
} from "./premiumTokens";

// 프리미엄 섹션 2~10 공용 헤딩+서브 블록. ServiceSection 의 heading 슬롯과 달리
// 프리미엄 시안은 헤딩이 항상 중앙정렬 + 서브 카피를 동반하므로(서비스 랜딩은 children
// 첫 <p>로 서브를 흡수) 이 둘을 한 컴포넌트로 묶는다. 골드 강조(예: "A 프로그램")가
// 필요한 섹션은 heading 에 <span className="text-gold">…</span> 조각을 넘긴다.
// tone="dark" — S 페이지 다크 섹션(bg-ink-strong)에서 헤딩/서브를 흰색으로 반전한다.
// headingClassName/subClassName 을 명시하면 tone 무관하게 그 값이 우선한다.
type PremiumSectionHeadingProps = {
  heading: ReactNode;
  sub?: ReactNode;
  tone?: "light" | "dark";
  className?: string;
  headingClassName?: string;
  subClassName?: string;
};

export default function PremiumSectionHeading({
  heading,
  sub,
  tone = "light",
  className = "",
  headingClassName,
  subClassName,
}: PremiumSectionHeadingProps) {
  const resolvedHeadingClassName =
    headingClassName ??
    (tone === "dark"
      ? PREMIUM_SECTION_HEADING_DARK_CLASS
      : PREMIUM_SECTION_HEADING_CLASS);
  const resolvedSubClassName =
    subClassName ??
    (tone === "dark"
      ? PREMIUM_SECTION_SUB_DARK_CLASS
      : PREMIUM_SECTION_SUB_CLASS);

  return (
    <div className={className}>
      <h2 className={resolvedHeadingClassName}>{heading}</h2>
      {sub ? <p className={`mt-3 ${resolvedSubClassName}`}>{sub}</p> : null}
    </div>
  );
}
