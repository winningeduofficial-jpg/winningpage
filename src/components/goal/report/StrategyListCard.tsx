import type { ReactNode } from "react";
import GoalCard from "@/components/goal/GoalCard";

type StrategyRow = {
  label: string;
  value?: ReactNode;
};

type StrategyListCardProps = {
  title?: ReactNode;
  rows: StrategyRow[];
};

// Row4(월간 전용) 카드② `다음 달 관리 전략` — part-15 §268(전략 행 556×55 ×3).
// 체크박스/토글 어포던스가 시안에 없어(part-15 §386) 표시 전용 리스트로 구현한다(추정).
export default function StrategyListCard({
  title,
  rows,
}: StrategyListCardProps) {
  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-[22.4375rem] flex-col gap-4 px-6 py-6"
    >
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
        {title}
      </h3>
      <ul className="flex flex-1 flex-col justify-center gap-3">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 text-[0.8125rem] leading-[1.4]"
          >
            <span className="text-ink">{row.label}</span>
            <span className="shrink-0 font-semibold text-ink-strong">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </GoalCard>
  );
}
