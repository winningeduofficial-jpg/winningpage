import { Fragment, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

import { CARD_DESC_MUTED_CLASS, CARD_TITLE_CLASS } from "./serviceTokens";

// 탭 UI 섹션 본문(탭바 + 탭패널 카드).
//
// (a) 출처: 자기평가 StageSection / 목표관리 StageSection / 수행평가 CoachingSection 3종 통합.
//     기준 페이지(InDepthResearch)에 탭 섹션이 없으므로, 카드 표면은 정본 토큰
//     (#D7D7D7 보더 + #F9FAFB 배경, 고정 px 대신 aspect 비율)을 쓰는 자기평가 구조를 뼈대로
//     삼고, 카드 타이포는 기준의 카드 표준값(제목 1.25rem semibold tracking-[-0.02em] #525252,
//     본문 1rem medium leading-[1.4] #767676)으로 맞췄다.
//
// (b) 페이지별 차이 흡수:
//     - columns          : 3(기본) | 5 — 탭당 카드 수.
//     - ariaLabel        : tablist aria-label(예: '자기평가서 작성 단계').
//     - idPrefix         : 탭/패널 id 접두사. 한 페이지에 탭 섹션이 둘 이상 생겨도 id 충돌 없음.
//     - panelHeightClass : 탭 전환 시 레이아웃 점프를 막는 lg 고정 높이
//                          (자기평가 'lg:h-64.75', 수행평가 'lg:h-68').
//                          콘텐츠 줄 수에 종속된 실측값이라 공통값을 잡지 못해 prop 으로 남겼다.
//                          빈 문자열이면 자연 높이.
//     - 콘텐츠 없는 탭은 content[tab] 부재로 자동 disabled 처리된다. 별도 prop 을 두지 않는다.
//
// 비활성 탭 색은 #D9D9D9(대비 1.3:1, 접근성 미달) / #D7D7D7 대신 #A3A3A3 을 쓴다.
// 탭 폰트의 md 반응형 확대(md:text-[1.5rem])는 3원칙 1번 위반이라 폐기했다.
//
// ⚠ Tailwind JIT: 열 수 매핑은 반드시 리터럴 lookup 객체로 쓴다.
// 지원 개수: 3(기본값, 수행평가・자기평가) / 5(목표관리). 미등록 columns 값은 폴백 없이
// 그대로 둔다 — lookup 실패 시 className 이 비어 레이아웃이 눈에 띄게 깨지므로 호출자가
// 즉시 알아챈다(조용한 3열 대체는 오류를 숨긴다).
const TAB_PANEL_COLS: Record<number, string> = {
  3: "sm:grid-cols-3 lg:grid-cols-3",
  5: "sm:grid-cols-3 lg:grid-cols-5",
};

type TabCard = { title: string; desc: string; icon: string };

type ServiceTabsPanelProps = {
  tabs: string[];
  content: Record<string, TabCard[]>;
  columns?: 3 | 5;
  ariaLabel?: string;
  idPrefix: string;
  panelHeightClass?: string;
};

export default function ServiceTabsPanel({
  tabs,
  content,
  columns = 3,
  ariaLabel,
  idPrefix,
  panelHeightClass = "",
}: ServiceTabsPanelProps) {
  // 호출부(GoalManagement/PerformanceAssessment/SelfAssessment)가 항상 비어있지 않은
  // tabs 배열을 넘긴다는 전제 하의 폴백.
  const [activeTab, setActiveTab] = useState(
    () => tabs.find((tab) => content[tab]?.length) ?? tabs[0]!,
  );
  const activeCards = content[activeTab] || [];
  // 탭마다 카드 수가 다를 수 있다(과거 목표관리 '학부모 안내' 3장 vs 나머지 5장, QA 행232.
  // 현재는 전 탭 5장이지만 카드 수가 다시 어긋나도 그리드가 깨지지 않도록 유지).
  // columns prop 고정 열 수 그대로 쓰면 카드 수가 모자란 탭에서 빈 칸이 우측에 뜬다 —
  // 실제 카드 수가 지원 열 수(TAB_PANEL_COLS 키)와 맞으면 그 수로 그리드를 다시 잡아
  // 카드가 컨테이너 전체 폭을 고르게 채우게 하고, 안 맞으면(예상 밖 카드 수) 원래
  // columns로 조용히 폴백한다.
  const effectiveColumns = TAB_PANEL_COLS[activeCards.length]
    ? activeCards.length
    : columns;

  return (
    <>
      <ScrollArea
        axis="x"
        className="mt-8 flex items-center gap-5 sm:mt-10 lg:mt-11.5 lg:gap-7.5"
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab, index) => {
          const isDisabled = !content[tab]?.length;
          const isActive = tab === activeTab;
          return (
            <Fragment key={tab}>
              <button
                type="button"
                role="tab"
                id={`${idPrefix}-tab-${index}`}
                disabled={isDisabled}
                aria-disabled={isDisabled || undefined}
                aria-selected={isActive}
                aria-controls={`${idPrefix}-tabpanel`}
                onClick={() => !isDisabled && setActiveTab(tab)}
                className={`shrink-0 whitespace-nowrap text-[1.125rem] leading-[1.4] ${
                  isActive
                    ? "font-semibold text-ink"
                    : "font-medium text-[#A3A3A3]"
                } ${isDisabled ? "cursor-default" : ""}`}
              >
                {tab}
              </button>
              {index < tabs.length - 1 && (
                <span
                  aria-hidden="true"
                  className="h-4 w-px shrink-0 bg-line"
                />
              )}
            </Fragment>
          );
        })}
      </ScrollArea>

      <div
        id={`${idPrefix}-tabpanel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${tabs.indexOf(activeTab)}`}
        className={`mt-8 grid grid-cols-1 items-start gap-5 sm:mt-10 lg:mt-7.5 ${TAB_PANEL_COLS[effectiveColumns]} lg:gap-7.5 ${panelHeightClass}`}
      >
        {activeCards.map((card) => (
          <div
            key={`${activeTab}-${card.title}`}
            className="flex flex-col text-left"
          >
            <div className="flex aspect-453/200 items-center justify-center rounded-[0.5625rem] border border-line bg-surface-footer">
              {/* 아이콘 크기는 시안 절대치 138px에서 폰 목업 대비 과대하다는 QA 지적(행258)으로
                  110px로 축소했다. 박스는 aspect-[453/200]이지만 플렉스 아이템의 min-height:auto
                  content-based minimum 이 작동해, 카드가 좁아 aspect 유도 높이가 110px 밑으로
                  내려가면 박스가 아이콘에 맞춰 늘어난다. 따라서 아이콘이 박스를 넘치는 일은
                  구조적으로 없다. 대신 그 구간에서는 453:200 비율이 지켜지지 않는다. */}
              <img
                src={card.icon}
                alt=""
                aria-hidden="true"
                className="h-27.5 w-27.5 object-contain"
              />
            </div>
            <p className={`mt-4 ${CARD_TITLE_CLASS}`}>{card.title}</p>
            <p className={`mt-3.75 ${CARD_DESC_MUTED_CLASS}`}>{card.desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}
