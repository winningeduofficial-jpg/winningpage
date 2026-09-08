import GoalCard from "@/components/goal/GoalCard";

// Row4(월간 전용) 카드① `이번 달 학습 유형 진단` — part-12 §135, part-15 §267("학습 유형 진단
// 박스", 174×183). 배지 + 진단 본문.
type LearningTypeCardProps = {
  title?: string;
  badge?: string;
  body?: string;
};

export default function LearningTypeCard({
  title,
  badge,
  body,
}: LearningTypeCardProps) {
  return (
    <GoalCard tone="mint" className="flex min-h-89.75 flex-col gap-4 px-6 py-6">
      <h3 className="text-app-card-title font-bold text-ink-strong">{title}</h3>
      <span className="inline-flex w-fit items-center rounded-full bg-white px-3 py-1.5 text-app-label font-bold text-ink-strong">
        {badge}
      </span>
      <p className="text-app-label leading-[1.6] text-ink">{body}</p>
    </GoalCard>
  );
}
