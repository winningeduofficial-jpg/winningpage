import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import ColumnBody from "../column/ColumnBody";
import "./faqAnswerBody.css";

// 답변 패널(id={answerId})은 항상 렌더하고 hidden 속성으로 접는다(ServiceFaq.jsx:41-43
// 선례) — aria-controls가 가리키는 id가 닫힌 상태에도 DOM에 있어야 axe
// aria-valid-attr-value를 통과한다. 현행(구) Faq.jsx의 {isOpen && ...} 조건부 렌더는
// 이 위반을 갖고 있었다.
//
// 단, aria-controls 계약이 요구하는 건 패널 엘리먼트의 존재뿐이지 자식 콘텐츠까지
// 항상 렌더해야 하는 건 아니다. ColumnBody는 blocks가 있으면 useCreateBlockNote +
// BlockNoteView(=ProseMirror EditorView 1개)를 만드므로, 자식을 무조건 마운트하면
// FAQ 30건 기준 첫 페인트에 숨겨진 에디터 30개가 동시에 생성된다. 그래서 자식은
// 처음 열릴 때만 지연 마운트한다(mounted latch). 한 번 열렸으면 다시 접혀도
// 언마운트하지 않는다 — 그러지 않으면 재열림마다 BlockNote가 재생성되며 깜빡인다.
export default function FaqAccordionRow({ faq, isOpen, onToggle }) {
  const answerId = `faq-answer-${faq.id}`;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  return (
    <div className="border-b border-[#D7D7D7]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={answerId}
        className="flex w-full items-center justify-between gap-4 px-[1.375rem] py-[1.75rem] text-left transition-colors hover:bg-[#F9FAFB] focus-visible:bg-[#F9FAFB] focus-visible:outline-none"
      >
        <span className="break-keep text-base font-normal leading-[1.3] tracking-[-0.02em] text-[#525252]">
          {faq.question}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-[1.125rem] w-[1.125rem] shrink-0 text-[#1F1F1F] transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* content_json(BlockNote 정본)이 있으면 그걸, 없으면 answer 평문 미러를 렌더한다.
          ColumnBody는 post.content_json / post.content 를 읽으므로 여기서 어댑터로 넘긴다
          (ColumnBody.jsx / ColumnBodyBlockNote.jsx는 수정하지 않는다).
          role="region" 은 붙이지 않는다 — 이름 없는 region은 AT가 랜드마크로 노출하지
          않아 효과가 없다(ServiceFaq.jsx 선례: 답변 엘리먼트에 role을 붙이지 않는다). */}
      <div
        id={answerId}
        hidden={!isOpen}
        className="faq-answer-body bg-[#F9FAFB] px-[1.375rem] py-[1.5rem] sm:px-[2.25rem] sm:py-[1.875rem]"
      >
        {/* ColumnBody에는 className을 넘기지 않는다 — 여백(padding)은 이 래퍼 div가
            담당하고, ColumnBody는 기본 타이포(RICH_BASE/PLAIN_BASE)만 그대로 쓴다. */}
        {mounted && (
          <ColumnBody
            post={{
              id: faq.id,
              content_json: faq.content_json,
              content: faq.answer,
            }}
          />
        )}
      </div>
    </div>
  );
}
