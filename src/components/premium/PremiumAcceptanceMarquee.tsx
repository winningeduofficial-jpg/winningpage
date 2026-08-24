import { useInfiniteMarquee } from "@/hooks/useInfiniteMarquee";
import type { PremiumGraduateAcceptance } from "@/hooks/usePremiumGraduateAcceptances";

// §5 대학 합격 마퀴 — landing/AcceptanceSection.tsx 와 같은 useInfiniteMarquee 훅·카드
// 마크업을 쓰되, 탭(일반계열/의약학·특수계열) 없이 단일 트랙(track='graduate')만 렌더한다.
// 0건이면 섹션 자체를 렌더하지 않는다(no-fallback-constants).
type PremiumAcceptanceMarqueeProps = {
  heading: string;
  universities: PremiumGraduateAcceptance[];
};

export default function PremiumAcceptanceMarquee({
  heading,
  universities,
}: PremiumAcceptanceMarqueeProps) {
  const { scrollRef, repeatIndices, containerHandlers } = useInfiniteMarquee({
    itemCount: universities.length,
  });

  if (universities.length === 0) return null;

  const isMarquee = universities.length > 1;
  const renderIndices = isMarquee
    ? repeatIndices
    : universities.map((_, index) => index);

  return (
    <section
      aria-label="대학원입학 합격생"
      className="overflow-hidden bg-white"
    >
      <div className="pb-0 pt-16 sm:pt-20 lg:pt-[7.5rem]">
        <h2 className="break-keep text-center text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[1.75rem] lg:text-[2rem]">
          {heading}
        </h2>

        <div
          className="mx-auto mt-10 w-full max-w-[120rem]"
          {...containerHandlers}
        >
          <div
            ref={scrollRef as React.RefObject<HTMLDivElement>}
            className="landing-marquee-mask w-full cursor-grab overflow-x-auto [-ms-overflow-style:none] scrollbar-none active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
          >
            <ul
              className={`panel-fade flex w-max min-w-full items-center gap-5 px-5 sm:px-8 ${
                isMarquee ? "" : "justify-center"
              }`}
            >
              {renderIndices.map((itemIndex, renderIndex) => {
                const university = universities[itemIndex];
                if (!university) return null;

                const cycle = Math.floor(renderIndex / universities.length);
                const isClone = isMarquee && cycle !== 1;

                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: 무한 마퀴 클론이라 같은 university.id가 여러 번 반복된다 — renderIndex로 각 클론 사본을 구분한다.
                    key={`${university.id}-${renderIndex}`}
                    aria-hidden={isClone || undefined}
                    className="flex h-75 w-50 shrink-0 flex-col items-center gap-6 rounded-4xl bg-surface-footer pt-13"
                  >
                    {university.emblem_url ? (
                      <img
                        src={university.emblem_url}
                        alt={isClone ? "" : `${university.name} 엠블럼`}
                        width="120"
                        height="120"
                        loading="lazy"
                        className="h-22 w-22 object-contain"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-22 w-22 rounded-full bg-[#eef0f3]"
                      />
                    )}
                    <p className="w-full px-2 text-center text-[1.25rem] font-medium leading-[1.3] text-ink">
                      {university.name}
                    </p>
                    <p className="text-center text-[1rem] font-normal leading-[1.3] text-ink">
                      {university.subtitle ??
                        (university.count != null
                          ? `${university.count}명 합격`
                          : "")}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
