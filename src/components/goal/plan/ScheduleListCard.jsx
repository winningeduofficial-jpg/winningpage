import GoalDdayBadge from '../GoalDdayBadge';

// 중요일정 목록 카드 — docs/figma-goal/part-14.md #41(목록 정본), 1116×120.
// 삭제 UI는 시안에 없다(`수정`만 존재, part-13 §323 "삭제는 수정 모달 내부에 있을 가능성" 추정) —
// 이번 범위에서 삭제 버튼은 구현하지 않는다.
export default function ScheduleListCard({ schedule, onEdit }) {
  return (
    <div className="flex min-h-[7.5rem] items-center justify-between gap-6 rounded-2xl border border-line/60 bg-white px-6 py-5">
      <div className="flex min-w-0 items-center gap-[1.875rem]">
        <GoalDdayBadge dday={schedule.dday} />
        <div className="min-w-0">
          <p className="truncate text-[1.125rem] font-bold leading-[1.4] text-ink-strong">{schedule.title}</p>
          <p className="mt-2 truncate text-[0.875rem] leading-[1.4] text-ink-sub">{schedule.meta}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="h-[2.4375rem] shrink-0 rounded-lg border border-line px-4 text-[0.875rem] font-medium text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
      >
        수정
      </button>
    </div>
  );
}
