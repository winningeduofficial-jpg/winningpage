import GoalCard from '../GoalCard';
import GoalCardHeader from '../GoalCardHeader';
import GoalStatChip from '../GoalStatChip';

// "내신" 카드(530×364, part-07 #20 정본 기준) — 모의고사 카드와 짝을 이루는 2열 레이아웃.
// mockAdvice.naesin에는 dday 필드가 남아 있으나(mockExam과 동일 스키마를 재사용한 흔적) #20
// 카피 전문에는 내신 카드에 D-day가 없다 — 여기서는 의도적으로 렌더하지 않는다.
export default function NaesinCard({ data }) {
  return (
    <GoalCard tone="neutral" className="flex h-full flex-col gap-5 px-[2rem] py-[1.75rem]">
      <GoalCardHeader
        title="내신"
        action={
          <button
            type="button"
            // TODO(다음 단계): 내신 성적 추가 모달(530×537) 연결.
            className="text-[0.8125rem] font-medium leading-[1.4] text-primary"
          >
            + 성적 추가
          </button>
        }
      />
      <span className="text-[1rem] font-semibold leading-[1.4] text-ink-strong">{data.round}</span>
      <GoalStatChip label={data.metricLabel} value={data.metricValue} tone="purple" />
      <div className="mt-auto flex flex-col gap-2">
        <p className="text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">학습 조언</p>
        <p className="text-[0.875rem] leading-[1.5] text-ink">{data.advice}</p>
      </div>
    </GoalCard>
  );
}
