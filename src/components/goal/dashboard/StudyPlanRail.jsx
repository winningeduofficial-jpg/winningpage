import { useState } from 'react';
import GoalCard from '../GoalCard';
import GoalChecklistRow from '../GoalChecklistRow';
import GoalEmptyState from '../GoalEmptyState';
import AddTaskModal from '../modals/AddTaskModal';

// 우측 레일 "토요일 나의 학습 계획하기" 카드 — 데이터 유무에 따라 194↔342 가변(part-07 §272).
// 절대 좌표 대신 flex column + gap 20px(부모 GoalDashboard 레일 스택)로 쌓는다.
export default function StudyPlanRail({ tasks }) {
  // 모달 오픈 상태는 위젯이 스스로 소유한다(부모 Dashboard로 끌어올리지 않음).
  const [modalOpen, setModalOpen] = useState(false);
  const hasTasks = Array.isArray(tasks) && tasks.length > 0;

  return (
    <GoalCard tone="mint" className="flex flex-col gap-4 px-[1.25rem] py-[1.25rem]">
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">토요일 나의 학습 계획하기</h3>
      {hasTasks ? (
        <>
          <ul className="flex flex-col gap-2">
            {tasks.map((task, index) => (
              <GoalChecklistRow key={task.id ?? index} index={index + 1} text={task.text} status={task.status} />
            ))}
          </ul>
          {/* part-06 §279: "+ 버튼을 눌러 과제를 추가하세요"는 행이 있어도 상시 노출되는 안내문 —
              실제 + 버튼 노드는 시안에 없어 텍스트 자체를 클릭 가능한 트리거로 만들었다(추정). */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-center text-[0.75rem] leading-[1.4] text-ink-sub underline-offset-2 hover:underline"
          >
            + 버튼을 눌러 과제를 추가하세요
          </button>
          <button
            type="button"
            // TODO(다음 단계): 저장 API 연동(과제 추가 모달은 위 "+" 트리거로 연결 완료).
            className="h-[2.375rem] w-full rounded-lg bg-[#4CAF6D] text-[0.875rem] font-semibold leading-[1.4] text-white"
          >
            오늘 학습 계획 저장하기
          </button>
        </>
      ) : (
        <GoalEmptyState message="+ 버튼을 눌러 과제를 추가하세요" onAdd={() => setModalOpen(true)} />
      )}

      <AddTaskModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </GoalCard>
  );
}
