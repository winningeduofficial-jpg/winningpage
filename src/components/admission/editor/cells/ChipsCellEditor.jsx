import ImeSafeInput from "../ImeSafeInput";

// {chips: [{label, value}]} 셀 편집기 — recruit variant의 값 셀
// (admission-recruit-cell-values) 전용. 칩 추가·삭제·라벨/값 수정.
export default function ChipsCellEditor({ value, onChange }) {
  const chips =
    value && typeof value === "object" && Array.isArray(value.chips)
      ? value.chips
      : [];

  function commitChips(nextChips) {
    onChange({ chips: nextChips });
  }

  function updateChip(idx, patch) {
    commitChips(
      chips.map((chip, i) => (i === idx ? { ...chip, ...patch } : chip)),
    );
  }

  function removeChip(idx) {
    commitChips(chips.filter((_, i) => i !== idx));
  }

  function addChip() {
    commitChips([...chips, { label: "", value: "" }]);
  }

  return (
    <div className="flex flex-col gap-1">
      {chips.map((chip, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: chips는 삭제가 가능하지만 doc 스키마에 chip id가 없다. 스키마 확장 없이는 못 고치는 기존 제약 — 새 이슈로 별도 추적한다.
        <div key={idx} className="flex items-center gap-1">
          <ImeSafeInput
            type="text"
            value={chip.label ?? ""}
            onCommit={(next) => updateChip(idx, { label: next })}
            placeholder="라벨"
            className="admission-cell-editor-input w-20 border border-[#d7d7d7] px-1.5 py-1 text-[11px]"
          />
          <ImeSafeInput
            type="text"
            value={chip.value ?? ""}
            onCommit={(next) => updateChip(idx, { value: next })}
            placeholder="값"
            className="admission-cell-editor-input w-16 border border-[#d7d7d7] px-1.5 py-1 text-[11px]"
          />
          <button
            type="button"
            onClick={() => removeChip(idx)}
            className="text-[11px] font-bold text-red-500"
            aria-label={`칩 ${idx + 1} 삭제`}
          >
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addChip}
        className="text-left text-[11px] font-bold text-[#2348ff]"
      >
        + 칩 추가
      </button>
    </div>
  );
}
