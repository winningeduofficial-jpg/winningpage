import GoalCard from '../GoalCard';

// Row1 카드③ `이번 주/달 컨디션` — 이모지 + 라벨 + 일수 3행 리스트(196×200, part-11 §245~247).
export default function ConditionListCard({ title, rows }) {
  return (
    <GoalCard tone="neutral" className="flex min-h-[12.5rem] flex-col gap-4 px-5 py-6">
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">{title}</h3>
      <ul className="flex flex-1 flex-col justify-center gap-4">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between text-[0.875rem] leading-[1.4]">
            <span className="flex items-center gap-2">
              <span aria-hidden="true">{row.emoji}</span>
              <span className="text-ink">{row.label}</span>
            </span>
            <span className="font-semibold text-ink-strong">{row.value}</span>
          </li>
        ))}
      </ul>
    </GoalCard>
  );
}
