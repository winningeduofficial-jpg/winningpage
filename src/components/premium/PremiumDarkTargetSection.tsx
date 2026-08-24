import type { ReactNode } from "react";
import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_SECTION_BG_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// "이런 학생이라면, 지금 시작하세요" 섹션(국제・해외고 국내대 입학컨설팅 시안 전용, 다크
// 네이비 bg). 좌: 헤딩(gold 강조 줄 포함, 페이지가 조합)+sub. 우: 번호+제목이 한 줄에
// 나란히 오는 wide 리스트(PremiumNumberedList의 dark variant는 번호/제목이 줄바꿈되는
// 다른 레이아웃이라 재사용하지 않고 새로 만든다).
type TargetItem = {
  number: string;
  title: string;
  desc: string;
};

type PremiumDarkTargetSectionProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: TargetItem[];
};

export default function PremiumDarkTargetSection({
  heading,
  sub,
  items,
}: PremiumDarkTargetSectionProps) {
  if (!items || items.length === 0) return null;

  return (
    <section
      className={`${PREMIUM_DARK_SECTION_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
    >
      <div className={PREMIUM_CONTAINER_CLASS}>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-white sm:text-[1.75rem] lg:text-[2rem]">
              {heading}
            </h2>
            {sub ? (
              <p className="mt-3 break-keep text-[0.9375rem] leading-[1.5] text-white/70 sm:text-[1rem]">
                {sub}
              </p>
            ) : null}
          </div>

          <ul className="flex flex-col gap-8">
            {items.map((item) => (
              <li key={item.number} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <span
                    className={`text-[1.25rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
                  >
                    {item.number}
                  </span>
                  <p
                    className={`break-keep text-[1rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
                  >
                    {item.title}
                  </p>
                </div>
                <span
                  className="h-[0.09375rem] w-10 bg-gold opacity-60"
                  aria-hidden="true"
                />
                <p className="break-keep text-[0.875rem] leading-[1.5] text-white/70">
                  {item.desc}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
