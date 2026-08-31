// 열공 타이머(#25) 카드 그리드 하단 "+ 과목 추가하기"(QA B9). 카드(SubjectTimerCard)와
// 동일한 라운드(rounded-xl)의 점선 테두리 버튼 — 시안에 없는 신규 UI라 카드 톤에
// 맞춰 새로 만들었다(추정). 카탈로그(TIMER_SUBJECT_CATALOG) 과목이 전부 노출 중이면
// 더 추가할 여지가 없어 disabled로 막는다(호출부 Timer.tsx가 판단).
type AddSubjectButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export default function AddSubjectButton({
  onClick,
  disabled = false,
}: AddSubjectButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-full items-center justify-center rounded-xl border border-dashed border-line/60 text-[0.9375rem] font-semibold text-ink-sub transition-colors hover:bg-surface-04 disabled:cursor-not-allowed disabled:opacity-50"
    >
      + 과목 추가하기
    </button>
  );
}
