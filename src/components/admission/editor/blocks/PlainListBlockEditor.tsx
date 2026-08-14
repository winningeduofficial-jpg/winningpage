// docBlockOperations.js의 moveBlock/removeBlockAt/appendBlock은 이름과
// 달리 "Block 배열"에 특화된 로직이 아니라 순수 제네릭 배열 재배치·삭제·
// 추가 함수다(team-lead 지시 — "재사용할 수 있으면 그렇게 하라"). items
// 배열 조작에도 그대로 재사용해 같은 로직을 두 번 만들지 않는다.
import { appendBlock, moveBlock, removeBlockAt } from "../docBlockOperations";
import ImeSafeInput from "../ImeSafeInput";

// PlainListBlock 편집기 — items의 type·text 편집 + 항목 추가·삭제·순서
// 변경(2026-08-06 보완: "최소 편집"을 items 필드 편집으로만 좁게 해석해
// 항목 조작을 뺐던 첫 버전은 편집기로 실사용 불가였다는 지적 반영).
type PlainListEditorItem = { type?: string; text?: string };
type PlainListBlock = {
  kind: string;
  items?: PlainListEditorItem[];
  [key: string]: unknown;
};

type PlainListBlockEditorProps = {
  block: PlainListBlock;
  onChange: (block: PlainListBlock) => void;
};

export default function PlainListBlockEditor({
  block,
  onChange,
}: PlainListBlockEditorProps) {
  const items = block.items || [];

  function commitItems(nextItems: PlainListEditorItem[]) {
    onChange({ ...block, items: nextItems });
  }

  function updateItem(idx: number, patch: Partial<PlainListEditorItem>) {
    commitItems(
      items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    );
  }

  function addItem() {
    commitItems(appendBlock(items, { type: "text", text: "" }));
  }

  function removeItem(idx: number) {
    commitItems(removeBlockAt(items, idx));
  }

  function moveItem(idx: number, delta: number) {
    commitItems(moveBlock(items, idx, delta));
  }

  return (
    <div className="p-2">
      {/* 목록 전체를 설명하는 그룹 제목이라 특정 입력 하나에 매지 않는다 — 각 항목의
          select/input은 이미 자체 aria-label(`항목 N 종류/텍스트`)을 갖고 있다. */}
      <span className="mb-1 block text-[11px] font-bold text-gray-500">
        목록
      </span>
      {items.length === 0 && (
        <p className="text-[11px] text-gray-400">항목 없음</p>
      )}
      <div className="flex flex-col gap-1">
        {items.map((item, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: items는 순서 이동·삭제가 가능하지만 doc 스키마에 항목 id가 없다. 스키마 확장 없이는 못 고치는 기존 제약 — 새 이슈로 별도 추적한다.
          <div key={idx} className="flex items-center gap-1">
            <select
              value={item.type ?? "text"}
              onChange={(e) => updateItem(idx, { type: e.target.value })}
              aria-label={`항목 ${idx + 1} 종류`}
              className="border border-[#d7d7d7] px-1 py-1 text-[11px]"
            >
              <option value="bullet">bullet</option>
              <option value="subtitle">subtitle</option>
              <option value="text">text</option>
            </select>
            <ImeSafeInput
              type="text"
              value={item.text ?? ""}
              onCommit={(text) => updateItem(idx, { text })}
              aria-label={`항목 ${idx + 1} 텍스트`}
              className="admission-cell-editor-input w-full border border-[#d7d7d7] px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => moveItem(idx, -1)}
              disabled={idx === 0}
              aria-label={`항목 ${idx + 1} 위로`}
              className="text-xs disabled:text-gray-300"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveItem(idx, 1)}
              disabled={idx === items.length - 1}
              aria-label={`항목 ${idx + 1} 아래로`}
              className="text-xs disabled:text-gray-300"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => removeItem(idx)}
              aria-label={`항목 ${idx + 1} 삭제`}
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
        + 항목 추가
      </button>
    </div>
  );
}
