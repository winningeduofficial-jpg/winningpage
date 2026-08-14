import GoalCard from "../GoalCard";
import InsightBox from "../InsightBox";
import StatProgressRow from "./StatProgressRow";

// Row2 카드② `시간대별 학습 효율` — 6개 시간대 리스트(part-11 §252~257). ⚠︎ 시안은 값이 `0h`인
// 행에도 채움 폭이 그려져 있는 결함(결함2)이 있다 — 여기서는 반드시 이 카드 내 최댓값 대비
// 비율로 재계산하므로 0h 행은 항상 완전히 빈 트랙으로 렌더된다(시안 잔여물 제거).
export default function TimeSlotEfficiencyCard({ title, rows, tip }) {
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
