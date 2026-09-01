import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_GRADUATE_GREEN,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// "위닝에듀는 이 2가지에만 집중합니다" 섹션 — 흰 패널 위 2컬럼, 각 컬럼은 제목(+옵션
// 뱃지) + 밑줄 + 불릿 리스트 + 옵션 하단 문단. 패널 아래 각주 리스트를 별도로 둔다.
// 시안 실측: 뱃지 배경은 표 헤더와 같은 진초록(PREMIUM_GRADUATE_GREEN) — premiumTokens 공유.
type FocusColumn = {
  title: string;
  badge?: string;
  bullets: string[];
  note?: string;
};

type PremiumFocusColumnsProps = {
  heading: ReactNode;
  sub?: ReactNode;
  columns: FocusColumn[];
  footnotes?: string[];
};

export default function PremiumFocusColumns({
  heading,
  sub,
  columns,
  footnotes,
}: PremiumFocusColumnsProps) {
  if (!columns || columns.length === 0) return null;

  return (
    <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading heading={heading} sub={sub} />

        <div
          className={`border border-line px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12 ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
            {columns.map((column) => (
              <div key={column.title} className="flex flex-col">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="break-keep text-[1.125rem] font-semibold leading-[1.4] text-ink-strong sm:text-[1.25rem]">
                    {column.title}
                  </h3>
                  {column.badge ? (
                    <span
                      className="whitespace-nowrap rounded-full px-3 py-1 text-[0.75rem] font-medium leading-[1.4] text-white"
                      style={{ backgroundColor: PREMIUM_GRADUATE_GREEN }}
                    >
                      {column.badge}
                    </span>
                  ) : null}
                </div>
                <span className="mt-4 h-px w-full bg-line" aria-hidden="true" />
                <ul className="mt-6 flex flex-col gap-3">
                  {column.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="break-keep text-[0.875rem] leading-[1.6] text-ink sm:text-[0.9375rem]"
                    >
                      {bullet}
                    </li>
                  ))}
                </ul>
                {column.note ? (
                  <p
                    className={`mt-6 break-keep text-[0.75rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS} sm:text-[0.8125rem]`}
                  >
                    {column.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {footnotes && footnotes.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-1">
            {footnotes.map((note) => (
              <li
                key={note}
                className={`break-keep text-[0.75rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS}`}
              >
                {note}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
