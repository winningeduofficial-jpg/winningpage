import { useId } from "react";
import ImeSafeTextarea from "../ImeSafeTextarea";

type PreTextBlockEditorProps = {
  block: { text?: string };
  onChange: (block: { text?: string }) => void;
};

// PreTextBlock 최소 편집기 — textarea 하나(여러 줄 원문 텍스트).
export default function PreTextBlockEditor({
  block,
  onChange,
}: PreTextBlockEditorProps) {
  const inputId = useId();
  return (
    <div className="p-2">
      <label
        htmlFor={inputId}
        className="mb-1 block text-[11px] font-bold text-gray-500"
      >
        원문 텍스트
      </label>
      <ImeSafeTextarea
        id={inputId}
        rows={8}
        value={block.text ?? ""}
        onCommit={(text) => onChange({ ...block, text })}
        className="admission-cell-editor-input w-full resize-y border border-[#d7d7d7] px-2 py-1 font-mono text-xs"
      />
    </div>
  );
}
