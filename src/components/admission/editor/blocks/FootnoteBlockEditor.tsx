import ImeSafeInput from "../ImeSafeInput";

// FootnoteBlock 편집기 — items: string[] 추가·삭제·수정. legacy
// (buildRecruitmentHtml, admissionParsing.js:2288)는 items를 공백으로
// join한 단일 admission-footnote div로 렌더한다(blocks/FootnoteView.jsx도
// 동일) — 항목은 개별 편집하되, 실제 렌더 결과를 미리 보여주기 위해
// join(' ') 미리보기 줄을 함께 보여준다.
type FootnoteBlock = {
  kind: string;
  items?: string[];
  [key: string]: unknown;
};

type FootnoteBlockEditorProps = {
  block: FootnoteBlock;
  onChange: (block: FootnoteBlock) => void;
};

export default function FootnoteBlockEditor({
  block,
  onChange,
}: FootnoteBlockEditorProps) {
  const items = block.items || [];

  function commitItems(nextItems: string[]) {
    onChange({ ...block, items: nextItems });
  }

  function updateItem(idx: number, text: string) {
    commitItems(items.map((item, i) => (i === idx ? text : item)));
  }

  function removeItem(idx: number) {
    commitItems(items.filter((_, i) => i !== idx));
  }

  function addItem() {
    commitItems([...items, ""]);
  }

  const preview = items.filter(Boolean).join(" ");

  return (
    <div className="p-2">
      {/* 목록 전체를 설명하는 그룹 제목이라 특정 입력 하나에 매지 않는다 — 각 항목은
          이미 자체 aria-label(`각주 항목 N`)을 갖고 있다. */}
      <span className="mb-1 block text-[11px] font-bold text-gray-500">
        각주
      </span>
      <div className="flex flex-col gap-1">
        {items.map((item, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: items는 삭제가 가능하지만 doc 스키마에 항목 id가 없다. 스키마 확장 없이는 못 고치는 기존 제약 — 새 이슈로 별도 추적한다.
          <div key={idx} className="flex items-center gap-1">
            <ImeSafeInput
              type="text"
              value={item ?? ""}
              onCommit={(text) => updateItem(idx, text)}
              aria-label={`각주 항목 ${idx + 1}`}
              className="admission-cell-editor-input w-full border border-[#d7d7d7] px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              aria-label={`각주 항목 ${idx + 1} 삭제`}
              className="text-xs font-bold text-red-500"
            >
              삭제
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="mt-1 text-xs font-bold text-[#2348ff]"
      >
        + 각주 항목 추가
      </button>
      {preview && (
        <p className="mt-2 rounded border border-[#d7d7d7] bg-[#f9fafb] px-2 py-1.5 text-[11px] text-gray-500">
          미리보기(실제 렌더는 항목을 공백으로 이어붙인 한 줄): {preview}
        </p>
      )}
    </div>
  );
}
