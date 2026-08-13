import GoalCard from "../GoalCard";
import InsightBox from "../InsightBox";
import StatProgressRow from "./StatProgressRow";

// Row3 카드① `완료한 핵심 학습 항목` — 주간 1행 / 월간 3행(part-11 §265, part-12 §125 결함9 정정 반영).
export default function CoreItemsCard({ title, rows, tip }) {
  const max = Math.max(...rows.map((row) => row.value), 0.0001);

  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-[22.4375rem] flex-col gap-5 px-6 py-6"
    >
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
        {title}
      </h3>
      <div className="flex flex-1 flex-col justify-center gap-3">
        {rows.map((row) => (
          <StatProgressRow
            key={row.label}
            label={row.label}
            value={row.value}
            unit={row.unit}
            max={max}
          />
        ))}
      </div>
      {tip && (
        <InsightBox variant={tip.variant} className="mt-auto">
          {tip.text}
        </InsightBox>
      )}
    </GoalCard>
  );
}
