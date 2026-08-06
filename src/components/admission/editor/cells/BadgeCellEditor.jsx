import ImeSafeInput from '../ImeSafeInput';

// {text, badge} 셀 편집기 — selection variant의 minimum 컬럼(admission-minimum-badge
// has/none) 전용. text와 badge를 각각 편집한다.
export default function BadgeCellEditor({ value, onChange }) {
  const cell = value && typeof value === 'object' ? value : { text: typeof value === 'string' ? value : '', badge: 'minimumNone' };
  const text = cell.text ?? '';
  const badge = cell.badge === 'minimumHas' ? 'minimumHas' : 'minimumNone';

  function commitText(nextText) {
    onChange({ text: nextText, badge });
  }

  function commitBadge(event) {
    onChange({ text, badge: event.target.value === 'minimumHas' ? 'minimumHas' : 'minimumNone' });
  }

  return (
    <div className="flex items-center gap-1">
      <ImeSafeInput
        type="text"
        value={text}
        onCommit={commitText}
        className="admission-cell-editor-input w-full border border-[#9ca3af] px-2 py-1.5 text-sm"
      />
      <select
        value={badge}
        onChange={commitBadge}
        className="border border-[#d7d7d7] px-1 py-1 text-xs"
        aria-label="최저 배지"
      >
        <option value="minimumHas">있음</option>
        <option value="minimumNone">없음</option>
      </select>
    </div>
  );
}
