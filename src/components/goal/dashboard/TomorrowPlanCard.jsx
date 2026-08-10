import GoalCard from '../GoalCard';
import { getSubjectBgClass } from '../subjectTokens';

// "내일 계획 제시" 카드(530×194) — 과목 칩 4개(part-07 카피 전문). 칩 배경은 과목 색 토큰
// (tailwind.config.js `goal.subject.*`) 재사용, 미지정 과목은 etc(중립 웜그레이)로 폴백
// (subjectTokens.js 헬퍼가 정본 매핑을 제공 — 코드 검수 §1).

export default function TomorrowPlanCard({ plan }) {
  return (
    <GoalCard tone="neutral" className="flex h-full flex-col gap-4 px-[2rem] py-[1.75rem]">
      <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">내일 계획 제시</h3>
      <div className="flex flex-wrap gap-2">
        {plan.map((item) => (
          <span
            key={`${item.subject}-${item.unit}`}
            className={`inline-flex h-8 w-fit shrink-0 items-center rounded-full px-4 text-[0.8125rem] font-medium leading-[1.2] text-ink-strong ${getSubjectBgClass(
              item.subject
            )}`}
          >
            {item.subject}({item.unit}) {item.duration}
          </span>
        ))}
      </div>
    </GoalCard>
  );
}
