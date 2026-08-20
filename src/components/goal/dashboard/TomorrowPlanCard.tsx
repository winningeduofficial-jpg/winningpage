import GoalCard from "@/components/goal/GoalCard";
import { getSubjectBgClass } from "@/components/goal/subjectTokens";

// "내일 계획 제시" 카드(530×194) — 과목 칩 4개(part-07 카피 전문). 칩 배경은 과목 색 토큰
// (tailwind.config.js `goal.subject.*`) 재사용, 미지정 과목은 etc(중립 웜그레이)로 폴백
// (subjectTokens.js 헬퍼가 정본 매핑을 제공 — 코드 검수 §1).

type TomorrowPlanItem = {
  subject: string;
  unit: string;
  duration: string;
};

type TomorrowPlanCardProps = {
  plan: TomorrowPlanItem[];
};

export default function TomorrowPlanCard({ plan }: TomorrowPlanCardProps) {
  return (
    <GoalCard tone="neutral" className="flex h-full flex-col gap-4 px-8 py-7">
      <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
        내일 계획 제시
      </h3>
      {/* 내일 계획 산출 로직 미이식(docs/figma-goal/calc-port-status.md §9.2, AdviceCard와
          동일 사유) — 위젯이 데이터 유무로 스스로 분기한다(빈 배열이면 준비 중 문구). */}
      {plan.length === 0 ? (
        <p className="text-[0.875rem] leading-normal text-ink-sub">
          내일 계획 산출 준비 중입니다.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {plan.map((item) => (
            <span
              key={`${item.subject}-${item.unit}`}
              className={`inline-flex h-8 w-fit shrink-0 items-center rounded-full px-4 text-[0.8125rem] font-medium leading-[1.2] text-ink-strong ${getSubjectBgClass(
                item.subject,
              )}`}
            >
              {item.subject}({item.unit}) {item.duration}
            </span>
          ))}
        </div>
      )}
    </GoalCard>
  );
}
