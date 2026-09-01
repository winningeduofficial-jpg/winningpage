import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §3 대상 학생 2단 카드 — 일러스트 400×234(=25rem×14.625rem) + 캡션.
type PremiumAudienceItem = {
  image: string;
  caption: string;
};

type PremiumAudienceProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: PremiumAudienceItem[];
};

export default function PremiumAudience({
  heading,
  sub,
  items,
}: PremiumAudienceProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading heading={heading} sub={sub} />
        <div
          className={`grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-[6.25rem] ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {items.map((item) => (
            <div
              key={item.caption}
              className="flex flex-col items-center gap-4"
            >
              <img
                src={item.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-[14.625rem] w-full max-w-[25rem] object-cover"
              />
              <p className="break-keep text-center text-[1.5rem] font-semibold leading-[1.4] text-ink">
                {item.caption}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
