import { COUNSEL_FIELD_SECTION, COUNSEL_FIELDS } from "../../data/mentorApply";
import { MENTOR_ASSETS } from "../../data/mentorApplyAssets";
import { useInfiniteMarquee } from "../../hooks/useInfiniteMarquee";
import { MENTOR_HEADING_MD } from "../services/serviceTokens";

// 멘토신청 §4 상담 분야 — 7카드 풀블리드 무한 마퀴 (docs/mentor-apply-spec.md §4 F-1, Figma 3408:4545).
//
// 왜 신규 컴포넌트인가 —
//   `services/ServiceOutcomesPanel.jsx` 는 4/5열 + divide-x 로 나뉜 **단일 패널** 구조라
//   개별 그림자 카드 7장과 DOM 이 근본적으로 다르고, 아이콘 높이도 고정이라 7열에서 라벨이 깨진다
//   (명세 §재사용 매핑 "재사용 불가" 확정).
//
// 왜 ServiceSection 을 쓰지 않았나 —
//   ServiceSection 은 children 을 전부 `max-w-content`(72.75rem) 컨테이너 안에 넣는다. 이 섹션의
//   카드 트랙은 컨테이너 밖으로 나가는 풀블리드라 컨테이너 안에서는 표현할 수 없다. `w-screen` +
//   `left-1/2 -translate-x-1/2` 브레이크아웃 해킹은 스크롤바 폭만큼 body 가로 스크롤을 만들어
//   전역 레이아웃을 깨뜨린다. 그래서 섹션 껍데기(`bg-white pt-16 sm:pt-20`)와 헤딩 컨테이너만
//   ServiceSection 과 문자 그대로 동일하게 맞추고, 트랙은 <section> 직속으로 뺐다.
//
// 시안 실측 → rem:
//   카드 292×322 / radius 20(1.25rem) / 배경 #FFFFFF / 그림자 0 4px 8px rgba(0,0,0,.1)
//   패딩 좌우 23(1.4375rem)·상하 28(1.75rem) / 카드 gap 23(1.4375rem)
//   아이콘 슬롯 150(9.375rem) / 제목↔설명 gap 20(1.25rem) / 타이틀↔카드행 gap 52(3.25rem)
//   정적 트랙 총 폭 292×7 + 23×6 = 2182(136.375rem) / 마퀴 1사이클(카드7+갭7) = 2205px.
//
// ⚠ 오버플로우 처리 방침 확정(2026-08-11 사용자 지시) — 기존 정적 가로 스크롤 트랙을
//   **기존 무한 마퀴 엔진(`useInfiniteMarquee`)으로 교체**한다. "모든 세부사항은 기존 마퀴를
//   따라간다"는 지시에 따라 속도·마스크·pause·클론 방식을 임의로 바꾸지 않고 기존 소비처
//   (`AcceptanceSection.jsx:109-124` / `MentorSection.jsx:58-67`)의 셸 관용구를 그대로 재현했다.
//   훅(`src/hooks/useInfiniteMarquee.js`)은 랜딩 합격생·멘토·콜멘토 3개 화면이 동시에 참조하는
//   공용 코드라 **이번 작업에서는 건드리지 않는다** — 명세 F-1 이 제안한 focus/blur pause 확장은
//   보류하고, 훅 변경 없이 소비처 쪽 마크업 전환만으로 요구를 충족했다.
//   ⚠ 알려진 한계: 훅의 자동 롤링 정지 수단은 hover(마우스)뿐이라 키보드 사용자는 자동 롤링을
//   멈출 방법이 없다(WCAG 2.2.2 관련). 기존 마퀴 소비처 두 곳도 동일한 한계를 이미 갖고 있고,
//   이번 지시가 "기존 마퀴 그대로"이므로 이 한계도 함께 이식된다. 개선하려면 훅의 공용 변경이
//   필요해 별도 과제로 남긴다.
//
// ⚠ `계획·시간관리`(2번)와 `대학·입시전략`(5번)이 **같은 달력+시계 아이콘**을 공유한다.
//   시안의 미완/플레이스홀더로 보이지만(명세 확인 항목 ⑪) 매니페스트가 주는 대로 쓴다 —
//   전용 아이콘이 확정되면 mentorApplyAssets.js 의 admissionStrategy 키만 교체하면 된다.

// 카드 폭은 시안 292(18.25rem)를 전 구간 고정한다. 375 뷰포트에서도 우측에 다음 카드가 43px
// 걸쳐 보여 "옆으로 더 있다"는 스크롤 어포던스가 자연히 생긴다.
const COUNSEL_CARD_CLASS =
  "flex h-full w-[18.25rem] shrink-0 flex-col items-center rounded-[1.25rem] bg-white px-[1.4375rem] py-[1.75rem] text-center shadow-[0_0.25rem_0.5rem_rgba(0,0,0,0.1)]";

// 아이콘 슬롯 150×150. 원본 PNG 는 카드마다 실제 비율이 달라(110×124 ~ 126×126) object-contain
// 으로 슬롯 안에 레터박스 처리하고, w/h 를 모두 명시해 원본 크기로 튀는 것을 막는다.
const COUNSEL_ICON_CLASS = "h-[9.375rem] w-[9.375rem] shrink-0 object-contain";

// 카드 제목 24 SemiBold / lh 1.3 / #191D23(ink.strong) — §3 혜택 카드(#181D24, lh 1.4)와 다르다.
// 설명 16 Regular / lh 1.3 / #525252(ink).
const COUNSEL_TITLE_CLASS =
  "break-keep text-[1.25rem] font-semibold leading-[1.3] text-ink-strong lg:text-[1.5rem]";

// 설명 min-height 2줄 고정 — 카드 1~3 은 설명이 2줄, 4~7 은 1줄이라 그대로 두면 카드 높이가
// 달라지고(그리드 stretch 로 높이를 맞춰도) 아이콘 세로 위치가 카드마다 어긋난다(확인 항목 ⑬).
// 16px × lh 1.3 × 2줄 = 41.6px = 2.6rem.
const COUNSEL_DESC_CLASS =
  "min-h-[2.6rem] whitespace-pre-line break-keep text-[1rem] font-normal leading-[1.3] text-ink";

type CounselFieldSectionProps = {
  className?: string;
};

export default function CounselFieldSection({
  className = "lg:pt-[8.75rem]",
}: CounselFieldSectionProps) {
  // 탭 전환이 없는 정적 7건 섹션이라 recenter 는 구조분해에서 뺀다
  // (AcceptanceSection 과 달리 콘텐츠가 바뀌어 재중앙 배치할 일이 없다).
  const { scrollRef, repeatIndices, containerHandlers } = useInfiniteMarquee({
    itemCount: COUNSEL_FIELDS.length,
  });

  return (
    // 껍데기(bg-white pt-16 sm:pt-20)는 ServiceSection 과 문자 동일. 기본 className 의
    // lg:pt-[8.75rem] 은 시안의 §3 블록 ↔ §4 블록 세로 간격 140px 이다(페이지에서 덮어쓸 수 있다).
    <section className={`bg-white pt-16 sm:pt-20 ${className}`}>
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 시안상 이 타이틀만 뷰포트 정중앙 정렬이다(타이틀 프레임 중심 x=960.5 = 1920/2). */}
        <h2 className={`${MENTOR_HEADING_MD} text-center`}>
          {COUNSEL_FIELD_SECTION.title}
        </h2>
      </div>

      {/*
        무한 롤링 마퀴 트랙 — AcceptanceSection.jsx:109-124 셸을 그대로 본떴다.
        - 바깥 래퍼: containerHandlers(hover/드래그/터치 pause) 스프레드 + 상단 여백.
        - 안쪽 스크롤 컨테이너: scrollRef 부착. role="region"/aria-label/tabIndex/focus-visible
          는 기존 정적 트랙에서 그대로 유지 — 스크롤바를 숨기므로(아래 클래스) 키보드 경로가
          없으면 좌우 클론 사이 카드 정보에 접근할 수 없다. landing-marquee-mask 는 기존 마퀴
          소비처 두 곳이 전부 쓰고 있어 동일하게 적용한다("모든 세부사항은 기존 마퀴를
          따라간다"는 사용자 지시).
        - <ul> 은 scrollRef div 의 유일한 자식이어야 훅의 measureCycleWidth 가 정확히
          동작한다(래퍼 중첩 금지). mx-auto 는 제거 — 마퀴 좌표계에서 무의미하다.
          py-2 는 카드 그림자(y+4, blur 8) 세로 클리핑 방지로 그대로 남긴다.
      */}
      <div className="mt-8 sm:mt-10 lg:mt-[3.25rem]" {...containerHandlers}>
        <section
          ref={scrollRef}
          aria-label={COUNSEL_FIELD_SECTION.title}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: APG Scrollable Regions 패턴 — 가로 스크롤 영역을 키보드로도 스크롤할 수 있게 한다.
          tabIndex={0}
          className="landing-marquee-mask w-full cursor-grab overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ul className="flex w-max min-w-full items-stretch gap-[1.4375rem] px-5 py-2 sm:px-8">
            {repeatIndices.map((fieldIndex, position) => {
              const item = COUNSEL_FIELDS[fieldIndex]!; // fieldIndex는 useInfiniteMarquee가 COUNSEL_FIELDS 길이 기준으로 생성해 항상 범위 내

              // N배 반복 중 초기 노출 사이클(1)만 스크린리더에 노출 — 랜딩 선례와 동일 계산식
              // (AcceptanceSection.jsx:130-131 / MentorSection.jsx:74-75).
              const cycle = Math.floor(position / COUNSEL_FIELDS.length);
              const isClone = cycle !== 1;

              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: 무한 마퀴 클론이라 같은 item.key가 여러 번 반복된다 — position으로 각 클론 사본을 구분한다.
                  key={`${item.key}-${position}`}
                  aria-hidden={isClone || undefined}
                  className="flex"
                >
                  <article className={COUNSEL_CARD_CLASS}>
                    {/* 일러스트는 바로 옆 제목이 뜻을 그대로 전달하는 장식 요소라 접근성 트리에서 뺀다. */}
                    <img
                      src={MENTOR_ASSETS.fields[item.key]}
                      alt=""
                      aria-hidden="true"
                      className={COUNSEL_ICON_CLASS}
                    />
                    <div className="mt-[0.6875rem] flex flex-col gap-[1.25rem]">
                      <h3 className={COUNSEL_TITLE_CLASS}>{item.title}</h3>
                      {/* desc 의 `\n` 은 시안 강제 개행이라 whitespace-pre-line 으로 보존한다. */}
                      <p className={COUNSEL_DESC_CLASS}>{item.desc}</p>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </section>
  );
}
