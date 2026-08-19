import type { ChangeEvent } from "react";
import ImeSafeInput from "@/components/admission/editor/ImeSafeInput";

type BadgeCellValue = { text?: string; badge?: string };

type BadgeCellEditorProps = {
  value: BadgeCellValue | string | undefined;
  onChange: (value: BadgeCellValue) => void;
};

// {text, badge} 셀 편집기 — selection variant의 minimum 컬럼(admission-minimum-badge
// has/none) 전용. text와 badge를 각각 편집한다.
export default function BadgeCellEditor({
  value,
  onChange,
}: BadgeCellEditorProps) {
  const cell: BadgeCellValue =
    value && typeof value === "object"
      ? value
      : { text: typeof value === "string" ? value : "", badge: "minimumNone" };
  const text = cell.text ?? "";
  const badge = cell.badge === "minimumHas" ? "minimumHas" : "minimumNone";

  function commitText(nextText: string) {
    onChange({ text: nextText, badge });
  }

  function commitBadge(event: ChangeEvent<HTMLSelectElement>) {
    onChange({
      text,
      badge: event.target.value === "minimumHas" ? "minimumHas" : "minimumNone",
    });
  }

  return (
    <div className="flex items-center gap-1">
      <ImeSafeInput
        type="text"
        value={text}
        onCommit={commitText}
        className="admission-cell-editor-input w-full border border-transparent bg-transparent px-2 py-1.5 text-sm outline-hidden transition-colors hover:border-line hover:bg-white focus:border-[#2348ff] focus:bg-white"
      />
      <select
        value={badge}
        onChange={commitBadge}
        className="border border-line px-1 py-1 text-xs"
        aria-label="최저 배지"
      >
        <option value="minimumHas">있음</option>
        <option value="minimumNone">없음</option>
      </select>
    </div>
  );
}
