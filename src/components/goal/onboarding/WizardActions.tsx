// 버튼 행 — docs/figma-goal/00-INDEX.md §5-3 `WizardActions`. 400×60(25rem×3.75rem), 간격
// 1.25rem. 1단계는 onPrev를 넘기지 않아 "다음" 단독 중앙 정렬, 2단계부터는 "이전 + 다음" 2열
// (작업 지시 셸 규격 절 "1단계는 다음 단독(중앙), 2단계부터 이전 + 다음 2열").
type WizardActionsProps = {
  onPrev?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  prevLabel?: string;
};

export default function WizardActions({
  onPrev,
  onNext,
  nextDisabled = false,
  nextLabel = "다음",
  prevLabel = "이전",
}: WizardActionsProps) {
  return (
    <div className="flex items-center justify-center gap-5">
      {onPrev && (
        <button
          type="button"
          onClick={onPrev}
          className="h-perf-inset w-100 rounded-full bg-surface-03 text-[1rem] font-semibold text-primary transition-colors hover:brightness-95"
        >
          {prevLabel}
        </button>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className={`h-perf-inset w-100 rounded-full text-[1rem] font-semibold transition-colors ${
          nextDisabled
            ? "cursor-not-allowed bg-surface-01 text-ink-sub"
            : "bg-primary text-white hover:bg-[#012347]"
        }`}
      >
        {nextLabel}
      </button>
    </div>
  );
}
