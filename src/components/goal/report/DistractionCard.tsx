import type { ReactNode } from "react";
import GoalCard from "@/components/goal/GoalCard";
import InsightBox from "@/components/goal/InsightBox";
import StatProgressRow from "./StatProgressRow";

type StatRow = { label: string; value: number; unit?: string };
type CardTip = { variant?: string; text?: ReactNode };

type DistractionCardProps = {
  title?: ReactNode;
  rows: StatRow[];
  tip?: CardTip | null | undefined;
};

// Row2 카드③ `학습 방해요인 분석` — 주간 2행 / 월간 3행(part-11 §258~261, part-12 §120).
export default function DistractionCard({
  title,
  rows,
  tip,
}: DistractionCardProps) {
  const max = Math.max(...rows.map((row) => row.value), 0.0001);

  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-110.25 flex-col gap-5 px-6 py-6"
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
        // InsightBox(다른 UoW 소유)는 undefined 미허용 — "info"는 InsightBox 자체 기본값과 동일
        <InsightBox variant={tip.variant ?? "info"} className="mt-auto">
          {tip.text}
        </InsightBox>
      )}
    </GoalCard>
  );
}
