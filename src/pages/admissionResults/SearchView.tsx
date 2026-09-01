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

type TrendingBlockProps = {
  trending: TrendingItem[];
  onSelectTrending?: (item: TrendingItem) => void;
};

// "지금 뜨고 있는 학과" 블록 — 칩이 있으면 칩 섹션, 없으면 여백만 남기는 스페이서.
// 비상세(검색만) 상태에서는 SearchView가 셀렉터 바로 아래에 그대로 렌더하고,
// 상세(isDetail) 상태에서는 셸(AdmissionResults.tsx)이 이 컴포넌트를 DetailView
// 아래로 옮겨 렌더한다(QA 리뷰) — 폼과 결과 사이에 이 블록의 pb-20~24가 끼어들어
// 순공백이 14.5rem까지 벌어지던 문제를 해소한다. 칩 자체의 리듬(pt-16/pb-20 계열)은
// 위치와 무관하게 그대로 유지한다.
export function TrendingBlock({
  trending,
  onSelectTrending,
}: TrendingBlockProps) {
  return trending.length ? (
    <section className={`${CONTAINER} pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pt-25`}>
      {/* TrendingChips(수정 범위 밖)는 이름만 같은 자기 로컬 TrendingItem을 쓴다
          (구조는 동일 — 위 타입 주석 참고) — 두 로컬 타입이 "unrelated"로
          찍히므로 여기서만 좁혀 캐스트한다. onSelect는 exactOptionalPropertyTypes라
          undefined 값을 명시적으로 넣을 수 없어 값이 있을 때만 키를 채운다. */}
      <TrendingChips
        items={
          trending as NonNullable<ComponentProps<typeof TrendingChips>["items"]>
        }
        {...(onSelectTrending ? { onSelect: onSelectTrending } : {})}
      />
    </section>
  ) : (
    // 칩 섹션을 렌더하지 않는 경우에도 페이지 하단 여백은 유지한다.
    <div className="pb-20 sm:pb-24" />
  );
}

type SearchViewProps = {
  selector: ComponentProps<typeof SelectorBar>;
  trending: TrendingItem[];
  onSelectTrending?: (item: TrendingItem) => void;
  // 상세 조회 결과가 폼 아래에 이어 붙는 상태(QA 리뷰) — true면 트렌딩 블록을 여기서
  // 렌더하지 않는다(셸이 DetailView 아래로 옮겨 그린다). 기본값 false(비상세 상태와
  // 동일하게 항상 그린다)라 다른 소비처가 생겨도 기존 동작이 안전하게 유지된다.
  suppressTrendingBlock?: boolean;
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
  suppressTrendingBlock = false,
}: SearchViewProps) {
  const { universityOptions, universityLoading, universityError } = selector;
  const universityUnavailable =
    !universityLoading && !universityError && universityOptions.length === 0;

  return (
    <>
      <section className={`${CONTAINER} pt-16 sm:pt-20 lg:pt-25`}>
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium leading-[1.3] tracking-[-0.02em] text-primary">
            {HERO_EYEBROW}
          </p>
          <div className="flex flex-col gap-6">
            <h1 className="break-keep text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-ink md:text-[2.75rem]">
              {HERO_TITLE}
            </h1>
            <p className="max-w-184 break-keep text-base font-medium leading-[1.6] text-[#7a7a7a]">
              {HERO_DESCRIPTION}
            </p>
          </div>
        </div>
      </section>

      <section className={`${CONTAINER} pt-12 sm:pt-14 lg:pt-25`}>
        <SelectorBar {...selector} />

        {universityUnavailable ? (
          <p className="mt-3 break-keep text-sm font-medium text-[#8f8f8f]">
            아직 공개된 입결 데이터가 없습니다. 대학별 최종등록자 교과등급을
            준비하고 있습니다.
          </p>
        ) : null}
      </section>

      {/* 상세 조회 결과가 폼 아래에 이어 붙는 상태에서는 이 블록을 여기서 그리지 않는다
          — 셸이 DetailView 아래로 옮겨 그린다(TrendingBlock 주석 참고). */}
      {suppressTrendingBlock ? null : (
        <TrendingBlock
          trending={trending}
          {...(onSelectTrending ? { onSelectTrending } : {})}
        />
      )}
    </>
  );
}
