import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_CARD_BORDER_CLASS,
  PREMIUM_CARD_SHADOW_STYLE,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_SECTION_BG_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §4 이슈 카드 — 기본(A) 3장 333×220(=20.8125rem×13.75rem), 흰 배경 + border-line + 시안 그림자.
// variant="dark" + columns=2 (S 페이지) — bg-ink-strong 배경, 카드 2×2, 카드 배경
// bg-white/10(반투명 회색) 보더 없음, 제목 골드 유지·본문 흰색.
type PremiumIssueCardItem = {
  title: string;
  description: ReactNode;
};

type PremiumIssueCardsProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: PremiumIssueCardItem[];
  variant?: "dark";
  columns?: 2 | 3;
};

export default function PremiumIssueCards({
  heading,
  sub,
  items,
  variant,
  columns = 3,
}: PremiumIssueCardsProps) {
  if (!items || items.length === 0) return null;

  const isDark = variant === "dark";

  return (
    <section
      className={`${isDark ? PREMIUM_DARK_SECTION_BG_CLASS : "bg-white"} ${PREMIUM_SECTION_PADDING_CLASS}`}
    >
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading
          heading={heading}
          sub={sub}
          tone={isDark ? "dark" : "light"}
        />
        <div
          className={`${
            columns === 2
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
              : "flex flex-col flex-wrap items-stretch justify-center gap-4 sm:flex-row"
          } ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {items.map((item) => (
            <div
              key={item.title}
              style={isDark ? undefined : PREMIUM_CARD_SHADOW_STYLE}
              className={`${
                columns === 2
                  ? "w-full p-10 sm:min-h-[5.625rem]"
                  : "w-full p-10 sm:w-[20.8125rem] sm:min-h-[13.75rem]"
              } ${isDark ? "bg-white/10" : PREMIUM_CARD_BORDER_CLASS}`}
            >
              <p className="text-[1.25rem] font-semibold leading-[1.4] text-gold">
                {item.title}
              </p>
              <p
                className={`mt-3 break-keep text-[1rem] leading-[1.5] ${isDark ? "text-white" : PREMIUM_NATURAL_TEXT_CLASS}`}
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
