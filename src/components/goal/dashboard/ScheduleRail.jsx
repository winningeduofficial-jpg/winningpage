import { useState } from 'react';
import GoalCard from '../GoalCard';
import GoalDdayBadge from '../GoalDdayBadge';
import GoalEmptyState from '../GoalEmptyState';
import AddScheduleModal from '../modals/AddScheduleModal';

// 우측 레일 "중요일정 체크하기" 카드 — 데이터 유무에 따라 194↔278 가변(part-07/08 §272/§200).
export default function ScheduleRail({ schedules }) {
  // 모달 오픈 상태는 위젯이 스스로 소유한다(부모 Dashboard로 끌어올리지 않음).
  const [modalOpen, setModalOpen] = useState(false);
  const hasSchedules = Array.isArray(schedules) && schedules.length > 0;

  return (
    <GoalCard tone="blue" className="flex flex-col gap-4 px-[1.25rem] py-[1.25rem]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">중요일정 체크하기</h3>
        {hasSchedules && (
          // 채움 상태에도 등록 진입점을 유지한다 — 시안엔 "+" 버튼 노드가 없어(00-INDEX.md §8-3 #1
          // 근거 문서) 목록 상태에서 추가할 방법이 없어지지 않도록 헤더에 최소 트리거를 추가했다(추정).
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label="일정 추가"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
          >
            +
          </button>
        )}
      </div>
      {hasSchedules ? (
        <ul className="flex flex-col gap-3">
          {schedules.map((schedule) => (
            <li key={schedule.title} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
                  {schedule.title}
                </p>
                <p className="mt-1 truncate text-[0.75rem] leading-[1.4] text-ink-sub">{schedule.meta}</p>
              </div>
              <GoalDdayBadge dday={schedule.dday} />
            </li>
          ))}
        </ul>
      ) : (
        <GoalEmptyState message="+ 버튼을 눌러 일정을 추가하세요" onAdd={() => setModalOpen(true)} />
      )}

      <AddScheduleModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </GoalCard>
  );
}
