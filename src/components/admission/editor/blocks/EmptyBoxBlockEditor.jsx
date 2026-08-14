import { useId } from "react";
import ImeSafeInput from "../ImeSafeInput";

// EmptyBoxBlock 최소 편집기 — message 하나.
export default function EmptyBoxBlockEditor({ block, onChange }) {
  const inputId = useId();
  return (
    <div className="p-2">
      <label
        htmlFor={inputId}
        className="mb-1 block text-[11px] font-bold text-gray-500"
      >
        내용 없음 안내 문구
      </label>
      <ImeSafeInput
        id={inputId}
        type="text"
        value={block.message ?? ""}
        onCommit={(message) => onChange({ ...block, message })}
        className="admission-cell-editor-input w-full border border-[#d7d7d7] px-2 py-1 text-xs"
      />
    </div>
  );
}
