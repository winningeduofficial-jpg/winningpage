import type { ReactNode } from "react";
import PremiumRoadmapDiagram from "./PremiumRoadmapDiagram";
import {
  PREMIUM_BEIGE_BG_CLASS,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// "장기 로드맵으로 내신부터 활동까지 관리합니다" 섹션(특목고입학 시안 전용, 베이지 bg).
// 좌: 헤딩+sub+01~04 좌측정렬 리스트. 우: PremiumRoadmapDiagram(원형 다이어그램).
type RoadmapItem = {
  number: string;
  title: string;
  desc: string;
};

type PremiumRoadmapSectionProps = {
  heading: ReactNode;
  sub?: ReactNode;
  items: RoadmapItem[];
  pills: [string, string, string, string, string, string];
};

export default function PremiumRoadmapSection({
  heading,
  sub,
  items,
  pills,
}: PremiumRoadmapSectionProps) {
  if (!items || items.length === 0) return null;

  return (
    <section
      className={`${PREMIUM_BEIGE_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
    >
      <div className={PREMIUM_CONTAINER_CLASS}>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[1.75rem] lg:text-[2rem]">
              {heading}
            </h2>
            {sub ? (
              <p className="mt-3 break-keep text-[1rem] font-medium leading-[1.4] text-ink sm:text-[1.125rem]">
                {sub}
              </p>
            ) : null}

            <ul className="mt-10 flex flex-col gap-6">
              {items.map((item) => (
                <li key={item.number} className="flex gap-4">
                  <span
                    className={`shrink-0 text-[1.25rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
                  >
                    {item.number}
                  </span>
                  <div>
                    <p className="break-keep text-[1rem] font-semibold leading-[1.4] text-ink-strong">
                      {item.title}
                    </p>
                    <p className="mt-1 break-keep text-[0.875rem] leading-[1.5] text-ink">
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <PremiumRoadmapDiagram pills={pills} />
        </div>
      </div>
    </section>
  );
}
