import ImeSafeInput from '../ImeSafeInput';

// PlainListBlock 최소 편집기 — 지시 범위대로 "items의 type·text" 편집만
// 지원한다(항목 추가·삭제·순서 변경은 이번 범위 밖 — 최소 편집).
export default function PlainListBlockEditor({ block, onChange }) {
  const items = block.items || [];

  function updateItem(idx, patch) {
    const nextItems = items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    onChange({ ...block, items: nextItems });
  }

  return (
    <div className="p-2">
      <label className="mb-1 block text-[11px] font-bold text-gray-500">목록(plainList)</label>
      {items.length === 0 && <p className="text-[11px] text-gray-400">항목 없음</p>}
      <div className="flex flex-col gap-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <select
              value={item.type ?? 'text'}
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
              value={item.text ?? ''}
              onCommit={(text) => updateItem(idx, { text })}
              aria-label={`항목 ${idx + 1} 텍스트`}
              className="admission-cell-editor-input w-full border border-[#d7d7d7] px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
