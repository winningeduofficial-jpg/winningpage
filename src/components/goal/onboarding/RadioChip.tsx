import { Check } from "lucide-react";
import type { ReactNode } from "react";

type RadioChipProps = {
  label?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
};

// 라디오 칩 — docs/figma-goal/00-INDEX.md §5-3 `RadioChip`. 높이 68px(4.25rem), hug 폭(라벨
// 길이에 따라 자연 폭), 간격은 부모가 gap-[0.75rem](12px)로 준다(part-01 구현 노트).
// 선택 시 파랑 보더 + 연한 하늘 배경(Surface/03) + 체크 원, 미선택 시 흰 배경 + 연회색 보더.
export default function RadioChip({
  label,
  selected,
  onClick,
}: RadioChipProps) {
  return (
    <label
      className={`flex h-17 shrink-0 cursor-pointer items-center gap-6 rounded-full border px-5 text-[1rem] font-medium leading-[1.4] transition-colors ${
        selected
          ? "border-accent bg-surface-03 text-accent"
          : "border-line bg-white text-ink hover:border-accent/50"
      }`}
    >
      <input
        type="radio"
        checked={selected}
        onChange={onClick}
        className="sr-only"
      />
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-accent bg-accent text-white"
            : "border-line text-transparent"
        }`}
      >
        <Check size={14} strokeWidth={3} />
      </span>
      {label}
    </label>
  );
}
