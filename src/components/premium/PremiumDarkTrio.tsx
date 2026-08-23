import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_BEIGE_BG_CLASS,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §8 "톡 하나로 시작됩니다" — 3장 검정 카드, 아이콘(svg) + 골드 제목 + 흰 본문.
type TrioItem = {
  /** public/images/premium/icon-*.svg 경로 — <img>로 렌더(직접 path 작성 금지). */
  icon: string;
  title: string;
  desc: string;
};

type PremiumDarkTrioProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: TrioItem[];
};

export default function PremiumDarkTrio({
  heading,
  sub,
  items,
}: PremiumDarkTrioProps) {
  if (!items || items.length === 0) return null;

  return (
    <section
      className={`${PREMIUM_BEIGE_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
    >
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading heading={heading} sub={sub} />
        <div
          className={`flex flex-col items-center gap-5 sm:flex-row sm:flex-wrap sm:justify-center ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {items.map((item) => (
            <div
              key={item.title}
              className="flex aspect-square w-full max-w-80 flex-col items-center justify-center gap-5 rounded-lg bg-black px-8 text-center"
            >
              <img
                src={item.icon}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="size-10"
              />
              <p
                className={`text-[1.5rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
              >
                {item.title}
              </p>
              <p className="break-keep text-[1.25rem] font-medium leading-[1.4] text-white">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
