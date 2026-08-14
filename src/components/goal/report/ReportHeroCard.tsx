// 성장 리포트 히어로 카드 — docs/figma-goal/00-INDEX.md §5-4 `ReportHeroCard`, part-11/12/15 실측
// (1340×230, 내부 흰색 KPI 스트립 1064×89, 5분할). 문장 길이가 서버 생성 값이라 가변이므로
// 카드 높이는 min-h로만 잡는다(part-15 §210 "히어로 카드 높이 230px는 min-height로").
import type { ReactNode } from "react";

type ReportHeroCardProps = {
  narrative?: ReactNode;
  kpis: Array<{ label: string; value: ReactNode }>;
};

export default function ReportHeroCard({
  narrative,
  kpis,
}: ReportHeroCardProps) {
  return (
    <div className="flex min-h-[14.375rem] flex-col justify-center gap-6 rounded-2xl bg-surface-04 px-8 py-7">
      <p className="max-w-[50rem] text-[0.9375rem] leading-[1.7] text-ink-strong">
        {narrative}
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl bg-white px-6 py-5 sm:grid-cols-5 sm:divide-x sm:divide-[#E9E9E9]">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="flex flex-col items-center gap-1.5 px-2 text-center"
          >
            <span className="text-[0.8125rem] leading-[1.4] text-ink-sub">
              {kpi.label}
            </span>
            <span className="text-[1.125rem] font-bold leading-[1.3] text-ink-strong">
              {kpi.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
