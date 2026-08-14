import { ChevronDown } from "lucide-react";
import { useState } from "react";

// FAQ 아코디언(단일 open).
//
// (a) 출처: InDepthResearch.jsx FaqItem + FaqSection.
//     FaqItem 은 이 모듈 내부 비공개다 — 4페이지 중 어디서도 개별 사용처가 없다.
//
// (b) 페이지별 차이 흡수:
//     - items 개수 제한 없음(4~5). 그 외 조절 prop 은 두지 않는다.
//       페이지마다 있던 md 오버라이드(md:py-8, sm:text-[1.5rem] 확대, md:text-[1.375rem] 답변)는
//       폰트에 배율/확대를 적용한 흔적(3원칙 1번 위반)이라 전부 단일값으로 정리했다.
//
// 접근성 보강: 기준에는 aria-expanded 만 있었다. 여기에 aria-controls + 답변 id 연결을
// 추가한다(시각 회귀 0).

function FaqItem({ item, index, isOpen, onToggle }) {
  const answerId = `faq-answer-${index}`;

  // 구분선은 마지막 항목 뒤에 없다(last:border-b-0). stroke #D9D9D9 → 토큰 #D7D7D7.
  return (
    <div className="border-b border-[#D7D7D7] py-6 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={answerId}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="break-keep text-[1.125rem] font-medium leading-[1.4] tracking-[-0.02em] text-[#525252]">
          {item.q}
        </span>
        {/* chevron 24 × 0.766 = 18.4px. 색 #808080 → #767676 상향. */}
        <ChevronDown
          className={`h-[1.125rem] w-[1.125rem] shrink-0 text-[#767676] transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {/* 답변은 항상 렌더하고 hidden 속성으로 접는다 — aria-controls 가 가리키는 id 가
          닫힌 상태에서도 DOM 에 존재해야 한다(조건부 렌더는 axe aria-valid-attr-value 위반). */}
      {/* 질문↔답변 32 × 0.766 = 24.5px = mt-6. */}
      <p
        id={answerId}
        hidden={!isOpen}
        className="mt-6 break-keep text-[1.125rem] font-normal leading-[1.6] text-[#767676]"
      >
        {item.a}
      </p>
    </div>
  );
}

export default function ServiceFaq({ items }) {
  // 시안 펼침 보드는 전 항목이 열려 있으나 이는 답변 전문 표시용 스펙 보드이지 동작 정의가
  // 아니다 — 4페이지 선례대로 단일 open 을 유지한다.
  const [openIndex, setOpenIndex] = useState(-1);

  return (
    // 헤딩→목록 60 × 0.766 = 46px = 2.875rem.
    <div className="mt-8 sm:mt-10 lg:mt-[2.875rem]">
      {items.map((item, index) => (
        <FaqItem
          key={item.q}
          item={item}
          index={index}
          isOpen={openIndex === index}
          onToggle={() => setOpenIndex((prev) => (prev === index ? -1 : index))}
        />
      ))}
    </div>
  );
}
