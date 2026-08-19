import type { KeyboardEvent } from "react";
import { useRef } from "react";
import { FAQ_TABPANEL_ID, getFaqTabId } from "./faqTabId";

type FaqCategoryTabsProps = {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
};

// role="tab" 을 붙이면 WAI-ARIA tabs 패턴상 tablist 안에서 Tab 키는 활성 탭
// 1개만 통과하고 좌우 화살표로 이동해야 한다(roving tabindex). 저장소 기존
// 선례(ServiceTabsPanel.jsx, SpecialHighschoolCases.jsx)엔 이게 빠져 있어
// role만 붙이고 실제로는 조작이 안 되는 상태였다 — 여기서는 넣는다.
export default function FaqCategoryTabs({
  tabs,
  active,
  onChange,
}: FaqCategoryTabsProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusAndSelect(index: number) {
    // 호출부(0 / tabs.length-1 / 모듈러 연산)가 항상 유효 범위 인덱스를 넘긴다.
    onChange(tabs[index]!);
    buttonRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === "Home") {
      event.preventDefault();
      focusAndSelect(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusAndSelect(tabs.length - 1);
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();

    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + delta + tabs.length) % tabs.length;
    focusAndSelect(nextIndex);
  }

  return (
    <div className="relative">
      <div
        role="tablist"
        aria-label="FAQ 카테고리"
        // overflow-x가 visible이 아니면 CSS 스펙상 overflow-y: visible은 auto로
        // 자동 승격된다(활성 탭 border-b-[0.1875rem] + -mb-px 조합이 세로로 살짝
        // 넘치는 값과 만나 실제 스크롤바로 나타남). 가로 스크롤(overflow-x-auto)은
        // 유지하되 세로는 explicit하게 hidden으로 박아 auto 승격을 막는다.
        className="flex items-center overflow-x-auto overflow-y-hidden border-b border-line"
      >
        {tabs.map((tab, index) => {
          const isActive = tab === active;

          return (
            <button
              key={tab}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={getFaqTabId(tab)}
              aria-selected={isActive}
              aria-controls={FAQ_TABPANEL_ID}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              // 시안은 "카테고리 1"~"카테고리 5"(5자, 5개) 전제로 24px/22px padding을
              // 그렸지만 실제 라벨은 최대 13자('개인정보 및 데이터 보안')에 7개(+전체 8개)다.
              // 아래 수치는 2026-08-07 라벨 rename 이후 1920px 뷰포트에서 재실측한 값이다.
              // 시안 치수(24px/22px)를 그대로 쓰면 8탭 총폭 1443px로 컨테이너(1100px)를
              // 343px 초과해 잘린다. 폰트를 24→18px, 좌우 padding을 22→12px로 줄이면
              // 총폭 1010px가 되어 1100px 안에 90px 여유를 두고 들어간다(최장 탭
              // '개인정보 및 데이터 보안'이 188px). "레이아웃에만 배율, 폰트는
              // 배율 미적용" 원칙의 예외가 아니라 시안이 전제하지 못한 라벨 개수·길이에
              // 대한 대응이다. 세로 padding(1.375rem)은 행 높이 급변을 막기 위해 유지.
              // ※ 2026-08-07 rename('학교·기관 도입 (B2G)' 14자 → '학교 및 기관 도입'
              // 10자)으로 최장 라벨이 짧아져 여유는 늘었지만, 이 결정은 뒤집지 마라 —
              // 24px/22px로 되돌리면 짧아진 라벨 기준으로도 여전히 343px 초과다.
              // (이전엔 -mb-px로 border-b를 tablist 자체 하단 border 위에 1px
              // 겹쳐 그렸으나, tablist에 overflow-y-hidden을 걸면 그 겹친 1px이
              // 잘려 활성 인디케이터가 3px→2px로 얇아 보였다. margin 제거로 border-b
              // 3px 전체가 클리핑 없이 온전히 보이게 한다.)
              className={`shrink-0 whitespace-nowrap border-b-[0.1875rem] p-4 text-base leading-[1.3] tracking-[-0.02em] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:px-3 sm:py-5.5 sm:text-lg ${
                isActive
                  ? "border-primary font-bold text-primary"
                  : "border-transparent font-normal text-[#A3A3A3]"
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>
      {/* 탭이 가로 스크롤로 넘칠 수 있음(카테고리 7개 + '전체')을 시각적으로 알리는
          페이드 마스크. 배경(main bg-white)과 동일한 색으로 우측 끝을 서서히 지운다.
          하단 1px(border-b 두께)은 마스크 밖에 남겨 tablist 구분선이 끊겨 보이지 않게 한다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 bottom-0.25 w-10 bg-linear-to-l from-white to-transparent"
      />
    </div>
  );
}
