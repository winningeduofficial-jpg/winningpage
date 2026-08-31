import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_BEIGE_BG_CLASS,
  PREMIUM_CARD_BORDER_CLASS,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_SECTION_BG_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §6 "A 프로그램이 관리하는 5가지 영역" — 카드 5장 전부 흰 배경이 기본이고, 시안의 다크
// 카드는 5번째 카드의 고정 스타일이 아니라 hover 상태 예시다(사용자 확인). 따라서 모든 카드에
// hover/focus-within 시 다크 반전 + 살짝 확대를 건다.
// 섹션 variant="dark" (S 페이지) — bg-ink-strong 배경, 카드 배경·보더 전부 제거(텍스트만 5열).
// staticDark(특목고입학 시안 전용) — 위 A 프로그램 판단과 달리 이 시안은 5번째 카드가
// 정적으로(hover 없이) 다크 배경이다. 카드 단위 옵트인 플래그라 나머지 카드/기존
// 사용처(A/S 카드 5장) 렌더는 전혀 영향받지 않는다 — hover 시 최종 상태와 동일한
// 클래스를 기본값으로 적용한다(hover는 계속 걸리지만 이미 같은 모양이라 무해하다).
type AreaCardItem = {
  number: string;
  title: string;
  bullets: string[];
  staticDark?: boolean;
};

type PremiumAreaCardsProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: AreaCardItem[];
  variant?: "dark";
};

function AreaCard({
  item,
  sectionVariant,
}: {
  item: AreaCardItem;
  sectionVariant?: "dark" | undefined;
}) {
  if (sectionVariant === "dark") {
    return (
      <div className="flex w-full shrink-0 flex-col lg:flex-1">
        <span className="text-[1.5rem] font-semibold leading-[1.4] text-gold">
          {item.number}
        </span>
        <p className="mt-2 break-keep text-[1rem] font-semibold leading-[1.4] text-white">
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
              className="flex items-start gap-2 break-keep text-[0.875rem] leading-[1.5] text-white"
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

  // hover:bg-ink-dark 는 PREMIUM_DARK_BG_CLASS(bg-ink-dark)와 같은 토큰이지만 리터럴로 둔다 —
  // Tailwind 는 `hover:${상수}` 같은 런타임 조합을 스캔하지 못해 클래스가 생성되지 않는다.
  const isStaticDark = item.staticDark === true;

  return (
    <div
      className={`group flex min-h-[19rem] w-full shrink-0 flex-col px-8 py-7 transition-[background-color,color,transform,box-shadow] duration-200 hover:scale-[1.03] hover:border-transparent hover:shadow-[0_0.5rem_1.75rem_rgba(28,26,25,0.28)] motion-reduce:transition-none motion-reduce:hover:scale-100 lg:flex-1 hover:bg-ink-dark hover:text-white ${
        isStaticDark
          ? "border border-transparent bg-ink-dark text-white"
          : PREMIUM_CARD_BORDER_CLASS
      }`}
    >
      <span
        className={`text-[1.5rem] font-semibold leading-[1.4] group-hover:text-white ${
          isStaticDark ? "text-white" : PREMIUM_GOLD_TEXT_CLASS
        }`}
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
            className={`flex items-start gap-2 break-keep text-[0.875rem] leading-[1.5] group-hover:font-semibold group-hover:text-white ${
              isStaticDark
                ? "font-semibold text-white"
                : PREMIUM_NATURAL_TEXT_CLASS
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
  variant,
}: PremiumAreaCardsProps) {
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
        />
        <div
          className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-row ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {items.map((item) => (
            <AreaCard key={item.number} item={item} sectionVariant={variant} />
          ))}
        </div>
      </div>
    </section>
  );
}
