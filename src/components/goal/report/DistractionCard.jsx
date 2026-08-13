import GoalCard from "../GoalCard";
import InsightBox from "../InsightBox";
import StatProgressRow from "./StatProgressRow";

// Row2 카드③ `학습 방해요인 분석` — 주간 2행 / 월간 3행(part-11 §258~261, part-12 §120).
export default function DistractionCard({ title, rows, tip }) {
  const max = Math.max(...rows.map((row) => row.value), 0.0001);

  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-[27.5625rem] flex-col gap-5 px-6 py-6"
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
            fillClassName="bg-[#F2B45C]"
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
