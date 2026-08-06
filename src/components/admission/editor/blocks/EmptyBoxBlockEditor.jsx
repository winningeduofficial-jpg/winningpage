import ImeSafeInput from '../ImeSafeInput';

// EmptyBoxBlock 최소 편집기 — message 하나.
export default function EmptyBoxBlockEditor({ block, onChange }) {
  return (
    <div className="p-2">
      <label className="mb-1 block text-[11px] font-bold text-gray-500">빈 상태 문구(emptyBox)</label>
      <ImeSafeInput
        type="text"
        value={block.message ?? ''}
        onCommit={(message) => onChange({ ...block, message })}
        className="admission-cell-editor-input w-full border border-[#d7d7d7] px-2 py-1 text-xs"
      />
    </div>
  );
}
