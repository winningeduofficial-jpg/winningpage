import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_BEIGE_BG_CLASS,
  PREMIUM_CARD_BORDER_CLASS,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_BG_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §6 "A 프로그램이 관리하는 5가지 영역" — 카드 4장은 흰 배경, 마지막 1장(variant='dark')만
// 어두운 강조 카드로 폭이 약간 넓다.
type AreaCardItem = {
  number: string;
  title: string;
  bullets: string[];
  /** 5번째 카드(학습 코칭·다크)만 지정 — 배경/텍스트 톤이 반전된다. */
  variant?: "dark";
};

type PremiumAreaCardsProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: AreaCardItem[];
};

function AreaCard({ item }: { item: AreaCardItem }) {
  const isDark = item.variant === "dark";

  return (
    <div
      className={`flex min-h-[19rem] w-full shrink-0 flex-col rounded-lg px-8 py-7 lg:flex-1 ${
        isDark
          ? `${PREMIUM_DARK_BG_CLASS} text-white shadow-[0_0.5rem_1.75rem_rgba(28,26,25,0.28)] lg:flex-[1.15]`
          : PREMIUM_CARD_BORDER_CLASS
      }`}
    >
      <span
        className={`text-[1.5rem] font-semibold leading-[1.4] ${isDark ? "text-white" : PREMIUM_GOLD_TEXT_CLASS}`}
      >
        {item.number}
      </span>
      <p className="mt-2 break-keep text-[1rem] font-semibold leading-[1.4]">
        {item.title}
      </p>
      <span
        className="mt-3 h-[0.09375rem] w-8 bg-gold opacity-60"
        aria-hidden="true"
      />
      <ul className="mt-4 flex flex-col gap-2">
        {item.bullets.map((bullet) => (
          <li
            key={bullet}
            className={`flex items-start gap-2 break-keep text-[0.875rem] leading-[1.5] ${
              isDark ? "font-semibold text-white" : PREMIUM_NATURAL_TEXT_CLASS
            }`}
          >
            <span
              className="mt-[0.4rem] size-[0.3125rem] shrink-0 rounded-full bg-gold"
              aria-hidden="true"
            />
            {bullet}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PremiumAreaCards({
  heading,
  sub,
  items,
}: PremiumAreaCardsProps) {
  if (!items || items.length === 0) return null;

  return (
    <section
      className={`${PREMIUM_BEIGE_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
    >
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading heading={heading} sub={sub} />
        <div
          className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-row ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {items.map((item) => (
            <AreaCard key={item.number} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
