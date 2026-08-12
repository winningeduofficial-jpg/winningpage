import { useState } from 'react';
import GoalPageHeader from '../../components/goal/GoalPageHeader';
import WeekdayPlanBoard from '../../components/goal/plan/WeekdayPlanBoard';
import AddTaskModal from '../../components/goal/modals/AddTaskModal';
import { mockWeeklyPlan } from '../../data/goalMock';

// 주간 학습 계획표(#27 빈 / #29 채움) — docs/figma-goal/part-09.md·part-10.md.
// mockWeeklyPlan(goalMock.js)이 #29 카피 전문과 1:1 동일해 그대로 재사용한다(신규 목업 불필요).
// 완전 빈 플래너(#27) 데모는 src/data/goalPlanMock.js의 mockWeeklyPlanEmpty를 대신 넘기면 된다
// (goalMock.js의 다른 *_Empty 상수들과 동일 컨벤션 — 기본 렌더는 채움 상태, 빈 상태는 필요 시 교체).
// 컴포넌트 자체는 이미 요일별 tasks:[] 를 자연스럽게 처리한다(mockWeeklyPlan의 일요일 컬럼이
// 그 증거) — 두 상태 모두 같은 WeekdayPlanBoard 로직으로 지원된다.
export default function WeeklyPlan() {
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  function handleAddTask(day) {
    setSelectedDay(day);
    setTaskModalOpen(true);
  }

  function handleCloseModal() {
    setTaskModalOpen(false);
    setSelectedDay(null);
  }

  return (
    <>
      <GoalPageHeader
        title="주간 학습 계획표"
        meta="2026.07.27 – 08.02"
        // 주 이동(이전/다음 주) 컨트롤이 시안에 없어 기간이 고정 텍스트처럼 보인다(part-09 §301).
        // 이번 범위에서 주 네비게이션은 구현하지 않는다. // 미확정
        subcopy="저장한 계획은 대시보드의 요일 학습 계획에 자동 반영됩니다."
      />
      <div className="max-w-goal-content px-[3rem] pb-24">
        {/* 저장 버튼이 시안에 없다 — 자동저장인지 시안 누락인지 불명(part-09 §300). // 미확정 */}
        <WeekdayPlanBoard days={mockWeeklyPlan} onAddTask={handleAddTask} />
      </div>

      {selectedDay && (
        <span className="sr-only" aria-live="polite">
          {selectedDay} 과제 추가 모달 열림
        </span>
      )}
      <AddTaskModal open={taskModalOpen} onClose={handleCloseModal} day={selectedDay ?? undefined} />
    </>
  );
}
