import GoalDdayBadge from "@/components/goal/GoalDdayBadge";
import { scheduleCategoryLabel } from "@/lib/goal/scheduleCategory";

// 중요일정 목록 카드 — docs/figma-goal/part-14.md #41(목록 정본), 1116×120.
// 삭제 UI는 시안에 없다(part-13 §323 "삭제는 수정 모달 내부에 있을 가능성" 추정) — 삭제는
// 수정 모달(AddScheduleFullModal.jsx) 안에 구현했다(중요일정 D 백엔드 배선 UoW).
// 일정 종류 배지는 시안 실측 근거가 없어 2026-08-13 확정으로 추가한 UI 보정이다.
type ScheduleListCardSchedule = {
  dday?: string | number;
  category?: string;
  title: string;
  meta?: string;
};

type ScheduleListCardProps = {
  schedule: ScheduleListCardSchedule;
  onEdit?: () => void;
};

export default function ScheduleListCard({
  schedule,
  onEdit,
}: ScheduleListCardProps) {
  return (
    <div className="flex min-h-30 items-center justify-between gap-6 rounded-2xl border border-line/60 bg-white px-6 py-5">
      <div className="flex min-w-0 items-center gap-7.5">
        {/* GoalDdayBadgeProps.dday는 undefined를 명시적으로 받지 않는다(exactOptionalPropertyTypes) —
            null도 동일하게 "없음"으로 처리되므로 값만 치환한다. */}
        <GoalDdayBadge dday={schedule.dday ?? null} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5.5 shrink-0 items-center rounded-full bg-surface-04 px-2 text-[0.75rem] font-medium leading-[1.2] text-ink-sub">
              {/* category 미정 시 CODE_TO_LABEL 조회가 실패해 "기타" 폴백은 동일하게 유지된다. */}
              {scheduleCategoryLabel(schedule.category ?? "")}
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
        className="h-9.75 shrink-0 rounded-lg border border-line px-4 text-[0.875rem] font-medium text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
      >
        수정
      </button>
    </div>
  );
}
