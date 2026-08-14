import type { ComponentProps } from "react";
import {
  CONTAINER,
  HERO_DESCRIPTION,
  HERO_EYEBROW,
  HERO_TITLE,
} from "./constants";
import SelectorBar from "./SelectorBar";
import TrendingChips from "./TrendingChips";

type TrendingItem = {
  key: string;
  label: string;
  // 호출부(AdmissionResults.tsx)의 trendingItems가 string | undefined 필드를
  // 그대로 싣는다 — exactOptionalPropertyTypes라 옵셔널 표기만으로는 안 받아진다.
  universityKey?: string | undefined;
  departmentKey?: string | undefined;
  logoUrl?: string;
};

type SearchViewProps = {
  selector: ComponentProps<typeof SelectorBar>;
  trending: TrendingItem[];
  onSelectTrending?: (item: TrendingItem) => void;
};

/**
 * 검색 뷰 (Figma 2029:661) — 히어로 → 셀렉터 바 → 지금 뜨고 있는 학과.
 *
 * 세로 리듬은 랜딩·서비스형 관례(SelfAssessment.jsx:229 외)를 따른다.
 * 시안의 섹션 간격 3종(149/113/105px)은 재현하지 않고 lg의 6.25rem으로 수렴시킨다.
 */
export default function SearchView({
  selector,
  trending,
  onSelectTrending,
}: SearchViewProps) {
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
          {/* TrendingChips(수정 범위 밖)는 이름만 같은 자기 로컬 TrendingItem을 쓴다
              (구조는 동일 — 위 타입 주석 참고) — 두 로컬 타입이 "unrelated"로
              찍히므로 여기서만 좁혀 캐스트한다. onSelect는 exactOptionalPropertyTypes라
              undefined 값을 명시적으로 넣을 수 없어 값이 있을 때만 키를 채운다. */}
          <TrendingChips
            items={
              trending as NonNullable<
                ComponentProps<typeof TrendingChips>["items"]
              >
            }
            {...(onSelectTrending ? { onSelect: onSelectTrending } : {})}
          />
        </section>
      ) : (
        // 칩 섹션을 렌더하지 않는 경우에도 페이지 하단 여백은 유지한다.
        <div className="pb-20 sm:pb-24" />
      )}
    </>
  );
}
