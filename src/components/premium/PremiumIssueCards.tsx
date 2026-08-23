import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_CARD_BORDER_CLASS,
  PREMIUM_CARD_SHADOW_STYLE,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §4 이슈 카드 3장 — 333×220(=20.8125rem×13.75rem), 흰 배경 + border-line + 시안 그림자.
type PremiumIssueCardItem = {
  title: string;
  description: ReactNode;
};

type PremiumIssueCardsProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: PremiumIssueCardItem[];
};

export default function PremiumIssueCards({
  heading,
  sub,
  items,
}: PremiumIssueCardsProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading heading={heading} sub={sub} />
        <div
          className={`flex flex-col flex-wrap items-stretch justify-center gap-4 sm:flex-row ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {items.map((item) => (
            <div
              key={item.title}
              style={PREMIUM_CARD_SHADOW_STYLE}
              className={`w-full rounded-lg p-10 sm:w-[20.8125rem] sm:min-h-[13.75rem] ${PREMIUM_CARD_BORDER_CLASS}`}
            >
              <p className="text-[1.25rem] font-semibold leading-[1.4] text-gold">
                {item.title}
              </p>
              <p
                className={`mt-3 break-keep text-[1rem] leading-[1.5] ${PREMIUM_NATURAL_TEXT_CLASS}`}
              >
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
