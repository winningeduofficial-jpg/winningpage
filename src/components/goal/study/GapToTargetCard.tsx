import type { ReactNode } from "react";
import GoalCard from "@/components/goal/GoalCard";
import GoalCardHeader from "@/components/goal/GoalCardHeader";

// "목표까지 남은 격차" 카드(#24 하단) — 3행: 항목명 / 현재→목표 설명 / 남은 값.
// part-08 §302~305/324~327. 시안 폭 1380px(86.25rem)은 프로젝트 공통 서브페이지 폭
// (`max-w-goal-content` 83.75rem)과 다르지만, 00-INDEX.md §6-3이 "서브페이지는 리포트 기준
// 1340px로 통일"을 이미 정본으로 채택했으므로 여기서도 공통 폭을 따른다(시안 폭은 주석으로만).
type GapRow = {
  label: string;
  description: string;
  remaining: string;
  /** 3구간 조언 한 줄(src/lib/goal/gapToTarget.ts buildZoneGapRows, QA 행295). 2구간
   * 시절 buildGapRows는 이 필드를 만들지 않으므로 선택값 — 없으면 조언 줄 자체를
   * 뺀다(억지 산출 금지). */
  advice?: string;
};

type GapToTargetCardProps = {
  rows: GapRow[];
  /** 타이틀 옆 인라인 보조 텍스트 — "어느 대학 기준인지"(예: "이상 목표 기준") 등.
   * src/lib/goal/gapToTarget.ts는 이 표시를 모른다(행마다 반복하지 않기 위해
   * 호출부가 카드 단위로 한 번만 얹는다). */
  meta?: ReactNode;
};

export default function GapToTargetCard({ rows, meta }: GapToTargetCardProps) {
  return (
    <GoalCard tone="neutral" className="flex flex-col gap-5 px-8 py-7.5">
      <GoalCardHeader title="목표까지 남은 격차" meta={meta} />
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex flex-col gap-2 rounded-xl bg-surface-04 px-6 py-4"
          >
            <div className="flex flex-wrap items-center gap-4">
              <span className="w-24 shrink-0 text-[0.9375rem] font-semibold leading-[1.4] text-ink-strong">
                {row.label}
              </span>
              <span className="min-w-0 flex-1 text-[0.875rem] leading-[1.4] text-ink">
                {row.description}
              </span>
              <span className="shrink-0 text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">
                {row.remaining}
              </span>
            </div>
            {row.advice ? (
              <p className="text-[0.8125rem] leading-[1.4] text-ink-sub">
                {row.advice}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </GoalCard>
  );
}
