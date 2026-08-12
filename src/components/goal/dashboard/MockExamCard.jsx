import { useState } from 'react';
import GoalCard from '../GoalCard';
import GoalCardHeader from '../GoalCardHeader';
import GoalStatChip from '../GoalStatChip';
import GoalDdayBadge from '../GoalDdayBadge';
import AddMockExamGradeModal from '../modals/AddMockExamGradeModal';

// "모의고사" 카드(530×364 = 33.125rem×22.75rem, part-07 #20 정본 기준). #23의 "기록한 성적"
// 3행 표(364→439 확장)는 이번 범위에 포함된 3개 상태 축(오늘 기록/차트/조언 유형)에 해당하지
// 않아 채택하지 않았다 — #20 기준 고정 높이로 구현(작업 보고 참고).
export default function MockExamCard({ data }) {
  // 모달 오픈 상태는 위젯이 스스로 소유한다(부모 Dashboard로 끌어올리지 않음).
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <GoalCard tone="neutral" className="flex h-full flex-col gap-5 px-[2rem] py-[1.75rem]">
      <GoalCardHeader
        title="모의고사"
        action={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-[0.8125rem] font-medium leading-[1.4] text-primary"
          >
            + 성적 추가
          </button>
        }
      />
      <div className="flex items-center gap-3">
        <span className="text-[1rem] font-semibold leading-[1.4] text-ink-strong">{data.round}</span>
        <GoalDdayBadge dday={data.dday} />
      </div>
      <GoalStatChip label={data.metricLabel} value={data.metricValue} tone="blue" />
      <div className="mt-auto flex flex-col gap-2">
        <p className="text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">학습 조언</p>
        <p className="text-[0.875rem] leading-[1.5] text-ink">{data.advice}</p>
      </div>

      <AddMockExamGradeModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </GoalCard>
  );
}
