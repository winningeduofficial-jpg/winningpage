import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// "합격은 기본, 클래스가 다른 컨설팅" 섹션(국제・해외고 국내대 입학컨설팅 시안 전용, 흰
// bg). 4열 좌측정렬 — 영문 타이틀(2줄) + 얇은 회색 밑줄(전체 폭) + 한글 설명. 불릿·뱃지
// 없는 단순 구조라 PremiumFocusColumns(2컬럼+뱃지+note)와 구조가 달라 재사용하지 않고
// 새로 만든다.
type EnglishColumn = {
  title: string;
  description: string;
};

type PremiumEnglishColumnsProps = {
  heading: ReactNode;
  headingClassName?: string;
  columns: EnglishColumn[];
};

export default function PremiumEnglishColumns({
  heading,
  headingClassName,
  columns,
}: PremiumEnglishColumnsProps) {
  if (!columns || columns.length === 0) return null;

  return (
    <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading
          heading={heading}
          {...(headingClassName ? { headingClassName } : {})}
        />
        <div
          className={`grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10 ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {columns.map((column) => (
            <div key={column.title} className="flex flex-col">
              <p className="break-keep text-[1rem] font-semibold leading-[1.4] text-ink-strong">
                {column.title}
              </p>
              <span className="mt-4 h-px w-full bg-line" aria-hidden="true" />
              <p
                className={`mt-4 break-keep text-[0.875rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS}`}
              >
                {column.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
