import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_SECTION_BG_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §5 4단계 포토 스텝 — 데스크탑 가로 연속(gap 0) 4장, 각 277×208(=17.3125rem×13rem).
// 모바일은 시안이 없어 2×2 그리드로 재량 적응(스펙 명시).
// variant="dark" (S 페이지) — bg-ink-strong 배경, 헤딩/서브 흰색. 사진·오버레이·라벨은 동일.
type PremiumPhotoStepItem = {
  image: string;
  label: string;
};

type PremiumPhotoStepsProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: PremiumPhotoStepItem[];
  variant?: "dark";
};

export default function PremiumPhotoSteps({
  heading,
  sub,
  items,
  variant,
}: PremiumPhotoStepsProps) {
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
          className={`grid grid-cols-2 sm:grid-cols-4 ${PREMIUM_HEADING_GAP_CLASS}`}
        >
          {items.map((item) => (
            <div
              key={item.label}
              className="relative h-[10rem] w-full overflow-hidden sm:h-[13rem]"
            >
              <img
                src={item.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(217,217,217,0)_0%,rgba(109,109,109,0.5)_35.6%,#000_100%)]" />
              <div className="absolute inset-0 flex items-center justify-center px-2">
                <p className="break-keep text-center text-[1.4125rem] font-semibold leading-[1.4] text-white">
                  {item.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
