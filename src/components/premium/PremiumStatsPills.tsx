import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_SECTION_BG_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §2 실적 pill 목록 — 데이터는 premium_achievements 테이블에서 페이지가 조회해
// items 로 내려준다. 0행이면 폴백 없이 섹션 자체를 렌더하지 않는다(no-fallback-constants).
type PremiumStatsPillsProps = {
  heading: ReactNode;
  items: { label: string; count: number }[];
  /** S 페이지 — 다크 배경, 흰 테두리/텍스트 pill. */
  variant?: "dark";
};

export default function PremiumStatsPills({
  heading,
  items,
  variant,
}: PremiumStatsPillsProps) {
  const isDark = variant === "dark";
  if (!items || items.length === 0) return null;

  return (
    <section
      className={`${isDark ? PREMIUM_DARK_SECTION_BG_CLASS : "bg-white"} ${PREMIUM_SECTION_PADDING_CLASS}`}
    >
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading
          heading={heading}
          tone={isDark ? "dark" : "light"}
        />
        <div
          className={`flex flex-wrap items-center justify-center gap-3 ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {items.map((item) => (
            <span
              key={item.label}
              className={`whitespace-nowrap rounded-[2.5rem] border px-5 py-3 text-[1rem] ${isDark ? "border-white text-white" : "border-ink-strong text-ink"}`}
            >
              {item.label} {item.count}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
