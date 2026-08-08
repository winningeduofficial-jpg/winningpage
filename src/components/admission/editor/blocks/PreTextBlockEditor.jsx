import ImeSafeTextarea from '../ImeSafeTextarea';

// PreTextBlock 최소 편집기 — textarea 하나(여러 줄 원문 텍스트).
export default function PreTextBlockEditor({ block, onChange }) {
  return (
    <div className="p-2">
      <label className="mb-1 block text-[11px] font-bold text-gray-500">원문 텍스트</label>
      <ImeSafeTextarea
        rows={8}
        value={block.text ?? ''}
        onCommit={(text) => onChange({ ...block, text })}
        className="admission-cell-editor-input w-full resize-y border border-[#d7d7d7] px-2 py-1 font-mono text-xs"
      />
    </div>
  );
}
