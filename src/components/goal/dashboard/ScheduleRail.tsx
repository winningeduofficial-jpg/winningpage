import { useNavigate } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import GoalDdayBadge from "@/components/goal/GoalDdayBadge";
import GoalEmptyState from "@/components/goal/GoalEmptyState";

// AddScheduleModal.jsx(#19, 530×574)는 여기서 더 이상 쓰지 않는다 — DB(goal_schedules,
// sql/74)에 없는 "일정"(반복 범위) select 필드가 있어 그대로 배선하면 값을 조용히
// 버려야 한다. 파일 자체는 지우지 않고(팀장 지시) "+"는 대신 중요일정 페이지의
// 등록 모달(정본, AddScheduleFullModal.jsx #40)로 이동시킨다.

// 우측 레일 "중요일정 체크하기" 카드 — 데이터 유무에 따라 194↔278 가변(part-07/08 §272/§200).
type ScheduleItem = {
  id?: string | number;
  title: string;
  meta?: string;
  dday?: string | number;
};

type ScheduleRailProps = {
  schedules?: ScheduleItem[] | null;
};

export default function ScheduleRail({ schedules }: ScheduleRailProps) {
  const navigate = useNavigate();
  const hasSchedules = Array.isArray(schedules) && schedules.length > 0;

  // /app/goal/schedules로 이동 + location.state.openCreate로 등록 모달 자동 오픈
  // (Schedules.jsx가 마운트 시 소비하고 즉시 history를 replace해 지운다 — 뒤로가기로
  // 돌아와도 다시 열리지 않는다).
  function goToScheduleRegister() {
    navigate("/app/goal/schedules", { state: { openCreate: true } });
  }

  return (
    <GoalCard tone="blue" className="flex flex-col gap-4 px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
          중요일정 체크하기
        </h3>
        {hasSchedules && (
          // 채움 상태에도 등록 진입점을 유지한다 — 시안엔 "+" 버튼 노드가 없어(00-INDEX.md §8-3 #1
          // 근거 문서) 목록 상태에서 추가할 방법이 없어지지 않도록 헤더에 최소 트리거를 추가했다(추정).
          <button
            type="button"
            onClick={goToScheduleRegister}
            aria-label="중요일정 페이지에서 일정 추가"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
          >
            +
          </button>
        )}
      </div>
      {hasSchedules ? (
        <ul className="flex flex-col gap-3">
          {schedules.map((schedule) => (
            <li
              key={schedule.id ?? schedule.title}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
                  {schedule.title}
                </p>
                <p className="mt-1 truncate text-[0.75rem] leading-[1.4] text-ink-sub">
                  {schedule.meta}
                </p>
              </div>
              <GoalDdayBadge dday={schedule.dday ?? null} />
            </li>
          ))}
        </ul>
      ) : (
        <GoalEmptyState
          message="+ 버튼을 눌러 일정을 추가하세요"
          onAdd={goToScheduleRegister}
        />
      )}
    </GoalCard>
  );
}
