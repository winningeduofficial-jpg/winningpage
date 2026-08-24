import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// "실제 합격생들의 합격 수기" 4카드(특목고입학 시안 전용, 흰 bg). 2×2 그리드 안에 얇은
// 구분선만 두른다(카드별 개별 보더/배경 없이 한 패널로 묶임 — 시안 실측). footnote는
// 패널 아래 우측 정렬 각주.
type SuccessStory = {
  label: string;
  name: string;
  badge: string;
  quote: string;
  note: string;
};

type PremiumSuccessStoriesProps = {
  heading: ReactNode;
  stories: SuccessStory[];
  footnote?: string;
};

const GRID_COLUMNS = 2;

export default function PremiumSuccessStories({
  heading,
  stories,
  footnote,
}: PremiumSuccessStoriesProps) {
  if (!stories || stories.length === 0) return null;

  const rows = Math.ceil(stories.length / GRID_COLUMNS);

  return (
    <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading heading={heading} />

        <div
          className={`grid grid-cols-1 border border-line sm:grid-cols-2 ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {stories.map((story, index) => {
            const row = Math.floor(index / GRID_COLUMNS);
            const isLastColumn =
              (index + 1) % GRID_COLUMNS === 0 || index === stories.length - 1;
            const isLastRow = row === rows - 1;

            return (
              <div
                key={story.name}
                className={`flex flex-col gap-3 px-6 py-6 sm:px-8 sm:py-7 ${
                  isLastRow ? "" : "border-b border-line"
                } ${isLastColumn ? "" : "sm:border-r sm:border-line"}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p
                    className={`break-keep text-[0.8125rem] leading-[1.4] ${PREMIUM_NATURAL_TEXT_CLASS}`}
                  >
                    {story.label}
                  </p>
                  <p
                    className={`whitespace-nowrap text-[0.8125rem] font-medium leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
                  >
                    {story.badge}
                  </p>
                </div>
                <p className="break-keep text-[1rem] font-semibold leading-[1.4] text-ink-strong">
                  {story.name}
                </p>
                <p className="break-keep text-[0.9375rem] leading-[1.6] text-ink">
                  {story.quote}
                </p>
                <p
                  className={`break-keep text-[0.8125rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS}`}
                >
                  {story.note}
                </p>
              </div>
            );
          })}
        </div>

        {footnote ? (
          <p
            className={`mt-4 break-keep text-right text-[0.75rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS}`}
          >
            {footnote}
          </p>
        ) : null}
      </div>
    </section>
  );
}
