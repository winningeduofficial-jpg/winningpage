import GoalCard from "@/components/goal/GoalCard";
import GoalCardHeader from "@/components/goal/GoalCardHeader";

// "목표까지 남은 격차" 카드(#24 하단) — 3행: 항목명 / 현재→목표 설명 / 남은 값.
// part-08 §302~305/324~327. 시안 폭 1380px(86.25rem)은 프로젝트 공통 서브페이지 폭
// (`max-w-goal-content` 83.75rem)과 다르지만, 00-INDEX.md §6-3이 "서브페이지는 리포트 기준
// 1340px로 통일"을 이미 정본으로 채택했으므로 여기서도 공통 폭을 따른다(시안 폭은 주석으로만).
type GapRow = { label: string; description: string; remaining: string };

type GapToTargetCardProps = {
  rows: GapRow[];
};

export default function GapToTargetCard({ rows }: GapToTargetCardProps) {
  return (
    <GoalCard tone="neutral" className="flex flex-col gap-5 px-8 py-7.5">
      <GoalCardHeader title="목표까지 남은 격차" />
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-04 px-6 py-4"
          >
            <span className="w-24 shrink-0 text-[0.9375rem] font-semibold leading-[1.4] text-ink-strong">
              {row.label}
            </span>
            <span className="min-w-0 flex-1 text-[0.875rem] leading-[1.4] text-ink">
              {row.description}
            </span>
            <span className="shrink-0 text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">
              {row.remaining}
            </span>
          </li>
        ))}
      </ul>
    </GoalCard>
  );
}
