import { Fragment } from "react";

import { CARD_TITLE_CLASS, CARD_DESC_CLASS } from "./serviceTokens";

// '완성까지의 흐름' 4단계 카드 그리드.
//
// (a) 출처: InDepthResearch.jsx ProcessSection('심화탐구, 이렇게 완성돼요')의 카드 행.
//     자기평가・수행평가・목표관리의 동일 섹션이 전부 이 마크업으로 수렴한다.
//     이 페이지군에서 유일하게 흰 배경 + #D7D7D7 보더 + 상시 그림자를 갖는 카드다.
//
// (b) 페이지별 차이 흡수:
//     - items[].desc 가 배열이면 항목 사이를 <br /> 로 잇는다.
//       수행평가의 명시 개행 카피를 보존하기 위한 유일한 분기다.
//     - STEP 라벨은 데이터가 아니라 index 로 생성한다(items 에 step 키를 넣지 않는다).
//
// 기준에 있던 설명문의 `mx-auto max-w-[12.4375rem]`(199px 클램프)은 이 저장소 3원칙 3번
// (카드 안 컨텐츠 폭은 max-width 로 제한하지 않고 카드 패딩으로만 결정)을 어겨 제거했다.
// 카드 폭 252.5px − 좌우 패딩 48px = 실효 204.5px 로 기존 199px 와 5.5px 차이뿐이다.
export default function ServiceProcessCards({ items }) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:mt-[4.3125rem] lg:grid-cols-4 lg:gap-[1.875rem]">
      {items.map((item, index) => (
        // 기본 상태 그림자를 상시 적용한다 — 시안은 offset(0,12)/radius 20/#D7D7D7 40%가
        // 항상 켜져 있다. 카드 높이는 고정하지 않는다.
        <div
          key={item.title}
          className="flex flex-col items-center justify-center gap-[0.9375rem] rounded-[1.25rem] border border-[#D7D7D7] bg-white px-6 py-8 text-center shadow-[0_0.75rem_1.25rem_rgba(215,215,215,0.4)] transition hover:-translate-y-1 hover:shadow-[0_0.75rem_1.5rem_rgba(1,50,98,0.08)]"
        >
          {/* 내부 리듬은 균등이 아니라 2단이다: 뱃지↔타이틀 3px, 상단그룹↔설명 15px.
              STEP 뱃지는 배경・패딩 없는 순수 텍스트다(수행평가의 배지 칩 스타일은 폐기). */}
          <div className="flex flex-col items-center gap-[0.1875rem]">
            <span className="text-[1rem] font-semibold leading-[1.4] text-[#013262]">
              {`STEP ${index + 1}`}
            </span>
            <p className={CARD_TITLE_CLASS}>{item.title}</p>
          </div>
          <p className={CARD_DESC_CLASS}>
            {Array.isArray(item.desc)
              ? item.desc.map((line, i) => (
                  <Fragment key={line}>
                    {i > 0 && <br />}
                    {line}
                  </Fragment>
                ))
              : item.desc}
          </p>
        </div>
      ))}
    </div>
  );
}
