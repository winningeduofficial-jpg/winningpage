import type { ReactNode } from "react";

type StepBadgeProps = {
  step: ReactNode;
};

// 스텝 배지 — docs/figma-goal/00-INDEX.md §5-3 `StepBadge`. 40×40(2.5rem) 회색 라운드 사각형에
// 스텝 번호("1" / "1-2" / "2" ... "7")를 채운다.
export default function StepBadge({ step }: StepBadgeProps) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-01 text-[0.875rem] font-semibold text-ink-sub">
      {step}
    </span>
  );
}
