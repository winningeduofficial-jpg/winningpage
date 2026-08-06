import ImeSafeInput from '../ImeSafeInput';

// 일반 문자열 셀 편집기.
export default function TextCellEditor({ value, onChange }) {
  const text = typeof value === 'string' ? value : (value?.text ?? '');

  return (
    <ImeSafeInput
      type="text"
      value={text}
      onCommit={onChange}
      className="admission-cell-editor-input w-full border border-[#9ca3af] px-2 py-1.5 text-sm"
    />
  );
}
