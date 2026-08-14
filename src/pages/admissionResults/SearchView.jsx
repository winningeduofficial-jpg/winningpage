import {
  CONTAINER,
  HERO_DESCRIPTION,
  HERO_EYEBROW,
  HERO_TITLE,
} from "./constants";
import SelectorBar from "./SelectorBar";
import TrendingChips from "./TrendingChips";

/**
 * 검색 뷰 (Figma 2029:661) — 히어로 → 셀렉터 바 → 지금 뜨고 있는 학과.
 *
 * 세로 리듬은 랜딩·서비스형 관례(SelfAssessment.jsx:229 외)를 따른다.
 * 시안의 섹션 간격 3종(149/113/105px)은 재현하지 않고 lg의 6.25rem으로 수렴시킨다.
 */
export default function SearchView({ selector, trending, onSelectTrending }) {
  const { universityOptions, universityLoading, universityError } = selector;
  const universityUnavailable =
    !universityLoading && !universityError && universityOptions.length === 0;

  return (
    <>
      <section className={`${CONTAINER} pt-16 sm:pt-20 lg:pt-[6.25rem]`}>
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium leading-[1.3] tracking-[-0.02em] text-[#013262]">
            {HERO_EYEBROW}
          </p>
          <div className="flex flex-col gap-6">
            <h1 className="break-keep text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-[#525252] md:text-[2.75rem]">
              {HERO_TITLE}
            </h1>
            <p className="max-w-[46rem] break-keep text-base font-medium leading-[1.6] text-[#7a7a7a]">
              {HERO_DESCRIPTION}
            </p>
          </div>
        </div>
      </section>

      <section className={`${CONTAINER} pt-12 sm:pt-14 lg:pt-[6.25rem]`}>
        <SelectorBar {...selector} />

        {universityUnavailable ? (
          <p className="mt-3 break-keep text-sm font-medium text-[#8f8f8f]">
            아직 공개된 입결 데이터가 없습니다. 대학별 최종등록자 교과등급을
            준비하고 있습니다.
          </p>
        ) : null}
      </section>

      {trending.length ? (
        <section
          className={`${CONTAINER} pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pt-[6.25rem]`}
        >
          <TrendingChips items={trending} onSelect={onSelectTrending} />
        </section>
      ) : (
        // 칩 섹션을 렌더하지 않는 경우에도 페이지 하단 여백은 유지한다.
        <div className="pb-20 sm:pb-24" />
      )}
    </>
  );
}
