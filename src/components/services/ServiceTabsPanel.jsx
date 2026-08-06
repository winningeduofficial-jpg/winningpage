import { Fragment, useState } from 'react';

import { CARD_TITLE_CLASS, CARD_DESC_MUTED_CLASS } from './serviceTokens';

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
//                          (자기평가 'lg:h-[16.1875rem]', 수행평가 'lg:h-[17rem]').
//                          콘텐츠 줄 수에 종속된 실측값이라 공통값을 잡지 못해 prop 으로 남겼다.
//                          빈 문자열이면 자연 높이.
//     - 콘텐츠 없는 탭은 content[tab] 부재로 자동 disabled 처리된다
//       (목표관리 '학부모 안내' 탭). 별도 prop 을 두지 않는다.
//
// 비활성 탭 색은 #D9D9D9(대비 1.3:1, 접근성 미달) / #D7D7D7 대신 #A3A3A3 을 쓴다.
// 탭 폰트의 md 반응형 확대(md:text-[1.5rem])는 3원칙 1번 위반이라 폐기했다.
//
// ⚠ Tailwind JIT: 열 수 매핑은 반드시 리터럴 lookup 객체로 쓴다.
// 지원 개수: 3(기본값, 수행평가・자기평가) / 5(목표관리). 미등록 columns 는 3열로 폴백한다
// (기본값과 동일 — className 에 'undefined' 문자열이 박히는 걸 막는다).
const TAB_PANEL_COLS = { 3: 'sm:grid-cols-3 lg:grid-cols-3', 5: 'sm:grid-cols-3 lg:grid-cols-5' };

export default function ServiceTabsPanel({
  tabs,
  content,
  columns = 3,
  ariaLabel,
  idPrefix,
  panelHeightClass = ''
}) {
  const [activeTab, setActiveTab] = useState(
    () => tabs.find((tab) => content[tab]?.length) ?? tabs[0]
  );
  const activeCards = content[activeTab] || [];

  return (
    <>
      <div
        className="mt-8 flex items-center gap-5 overflow-x-auto sm:mt-10 lg:mt-[2.875rem] lg:gap-[1.875rem]"
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
                  isActive ? 'font-semibold text-[#525252]' : 'font-medium text-[#A3A3A3]'
                } ${isDisabled ? 'cursor-default' : ''}`}
              >
                {tab}
              </button>
              {index < tabs.length - 1 && (
                <span aria-hidden="true" className="h-[1.4375rem] w-px shrink-0 bg-[#D7D7D7]" />
              )}
            </Fragment>
          );
        })}
      </div>

      <div
        id={`${idPrefix}-tabpanel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${tabs.indexOf(activeTab)}`}
        className={`mt-8 grid grid-cols-1 items-start gap-5 sm:mt-10 lg:mt-[1.875rem] ${TAB_PANEL_COLS[columns] ?? TAB_PANEL_COLS[3]} lg:gap-[1.875rem] ${panelHeightClass}`}
      >
        {activeCards.map((card) => (
          <div key={`${activeTab}-${card.title}`} className="flex flex-col text-left">
            <div className="flex aspect-[453/200] items-center justify-center rounded-[0.5625rem] border border-[#D7D7D7] bg-[#F9FAFB]">
              {/* ⚠ 아이콘 크기는 반드시 박스에 상대적이어야 한다. 박스 높이는 aspect-[453/200]
                  이라 카드 폭에 종속되는데(columns=5 · 1100px 컨테이너면 박스 높이 86.5px),
                  아이콘에 고정 138px(h-[8.625rem])을 주면 박스 밖으로 25.75px씩 삐져나와
                  아래 제목을 덮는다(플렉스 아이템의 min-height:auto 는 transferred size
                  suggestion = 폭×200/453 로 확정되므로 박스가 아이콘에 맞춰 늘어나지 않는다).
                  69% = 시안 비율 그대로(138/200)라 데스크톱 렌더는 동일하고, 열 수·뷰포트가
                  바뀌어도 비율이 유지된다. max-h 는 퍼센트 높이가 해석되지 않는 환경을 위한
                  안전망(시안 절대치)이다. */}
              <img
                src={card.icon}
                alt=""
                aria-hidden="true"
                className="h-[69%] max-h-[8.625rem] w-auto max-w-[80%] object-contain"
              />
            </div>
            <p className={`mt-4 ${CARD_TITLE_CLASS}`}>{card.title}</p>
            <p className={`mt-[0.9375rem] ${CARD_DESC_MUTED_CLASS}`}>{card.desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}
