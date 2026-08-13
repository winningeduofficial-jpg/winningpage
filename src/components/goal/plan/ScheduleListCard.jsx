import GoalDdayBadge from "../GoalDdayBadge";
import { scheduleCategoryLabel } from "../../../lib/goal/scheduleCategory";

// 중요일정 목록 카드 — docs/figma-goal/part-14.md #41(목록 정본), 1116×120.
// 삭제 UI는 시안에 없다(part-13 §323 "삭제는 수정 모달 내부에 있을 가능성" 추정) — 삭제는
// 수정 모달(AddScheduleFullModal.jsx) 안에 구현했다(중요일정 D 백엔드 배선 UoW).
// 일정 종류 배지는 시안 실측 근거가 없어 2026-08-13 확정으로 추가한 UI 보정이다.
export default function ScheduleListCard({ schedule, onEdit }) {
  return (
    <div className="flex min-h-[7.5rem] items-center justify-between gap-6 rounded-2xl border border-line/60 bg-white px-6 py-5">
      <div className="flex min-w-0 items-center gap-[1.875rem]">
        <GoalDdayBadge dday={schedule.dday} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-[1.375rem] shrink-0 items-center rounded-full bg-surface-04 px-2 text-[0.75rem] font-medium leading-[1.2] text-ink-sub">
              {scheduleCategoryLabel(schedule.category)}
            </span>
            <p className="truncate text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
              {schedule.title}
            </p>
          </div>
          <p className="mt-2 truncate text-[0.875rem] leading-[1.4] text-ink-sub">
            {schedule.meta}
          </p>
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
