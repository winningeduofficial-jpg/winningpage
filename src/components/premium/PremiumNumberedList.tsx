import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_BEIGE_BG_CLASS,
  PREMIUM_CARD_BORDER_CLASS,
  PREMIUM_CARD_SHADOW_STYLE,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_SECTION_BG_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §7 "고교 3년 내신을 끝까지 함께 관리합니다" — 세로 5카드, 좌측정렬 번호·제목·짧은
// 구분선·본문 (폭 ~700px = 43.75rem).
// variant="dark" (S 페이지) — bg-ink-strong 배경, 카드 박스 제거(보더·그림자·배경 없이
// 텍스트만 세로 나열), 번호·제목·구분선 골드 유지, 본문 흰색.
// desc: string | string[] — 국제・해외고 국내대 입학컨설팅 시안(§5 플랜 5스텝)은 본문이
// 단일 문단이 아니라 불릿 리스트다. 배열이면 골드 점 불릿 목록으로 렌더하고, 기존 문자열
// 사용처(단일 문단)는 그대로 렌더된다.
type NumberedItem = {
  number: string;
  title: string;
  desc: string | string[];
};

type PremiumNumberedListProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: NumberedItem[];
  variant?: "dark";
  /** 헤딩 색 override(예: 국제・해외고 국내대 입학컨설팅의 네이비 헤딩). 지정하지 않으면
   * 기존 tone 기반 기본값 그대로다. */
  headingClassName?: string;
};

export default function PremiumNumberedList({
  heading,
  sub,
  items,
  variant,
  headingClassName,
}: PremiumNumberedListProps) {
  if (!items || items.length === 0) return null;

  const isDark = variant === "dark";

  return (
    <section
      className={`${isDark ? PREMIUM_DARK_SECTION_BG_CLASS : PREMIUM_BEIGE_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
    >
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading
          heading={heading}
          sub={sub}
          tone={isDark ? "dark" : "light"}
          {...(headingClassName ? { headingClassName } : {})}
        />
        <div
          className={`mx-auto flex w-full max-w-[43.75rem] flex-col ${isDark ? "gap-8" : "gap-3"} ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {items.map((item) => (
            <div
              key={item.number}
              style={isDark ? undefined : PREMIUM_CARD_SHADOW_STYLE}
              className={
                isDark
                  ? "flex flex-col text-left"
                  : `flex min-h-[8.125rem] flex-col justify-center px-8 py-6 text-left ${PREMIUM_CARD_BORDER_CLASS}`
              }
            >
              <span
                className={`text-[1.5rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
              >
                {item.number}
              </span>
              <p
                className={`mt-1 break-keep text-[1rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
              >
                {item.title}
              </p>
              <span
                className="mt-2 h-[0.09375rem] w-6 bg-gold opacity-60"
                aria-hidden="true"
              />
              {Array.isArray(item.desc) ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {item.desc.map((line) => (
                    <li
                      key={line}
                      className={`flex items-start gap-2 break-keep text-[0.875rem] leading-[1.5] ${isDark ? "text-white" : PREMIUM_NATURAL_TEXT_CLASS}`}
                    >
                      <span
                        className="mt-[0.4rem] size-[0.3125rem] shrink-0 rounded-full bg-gold"
                        aria-hidden="true"
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  className={`mt-2 break-keep text-[0.875rem] leading-[1.5] ${isDark ? "text-white" : PREMIUM_NATURAL_TEXT_CLASS}`}
                >
                  {item.desc}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
