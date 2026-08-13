import ImeSafeInput from "../ImeSafeInput";

// HeadingBlock 최소 편집기 — text 하나.
export default function HeadingBlockEditor({ block, onChange }) {
  return (
    <div className="p-2">
      <label className="mb-1 block text-[11px] font-bold text-gray-500">
        소제목
      </label>
      <ImeSafeInput
        type="text"
        value={block.text ?? ""}
        onCommit={(text) => onChange({ ...block, text })}
        className="admission-cell-editor-input w-full border border-[#d7d7d7] px-2 py-1 text-xs"
      />
    </div>
  );
}
