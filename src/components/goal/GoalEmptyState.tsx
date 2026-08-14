// 목표관리 앱 빈 상태 — docs/figma-goal/00-INDEX.md §5-4 `EmptyState`.
// "+ 버튼을 눌러 …" 안내문 + CTA. 카드 단위로 쓴다(우측 레일 학습계획/중요일정 빈 상태).
type GoalEmptyStateProps = {
  message?: string;
  onAdd?: () => void;
};

// onAdd는 아직 no-op(TODO) — 모달 3종은 다음 단계 범위(과제 추가 / 중요일정 등록 / 성적 추가).
export default function GoalEmptyState({
  message,
  onAdd,
}: GoalEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
      <p className="text-[0.8125rem] leading-[1.4] text-ink-sub">{message}</p>
      <button
        type="button"
        onClick={onAdd}
        aria-label="추가"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
      >
        +
      </button>
    </div>
  );
}
