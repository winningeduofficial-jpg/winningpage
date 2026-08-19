import GoalCard from "@/components/goal/GoalCard";
import VerticalBarChart from "./VerticalBarChart";

// Row1 카드② — 주간 `요일별 공부 시간`(결함4 정정 제목) / 월간 `주차별 공부 시간`.
// 축 종류(요일 7 / 주차 4)만 데이터로 갈리고 카드 구조는 동일.
type BarItem = { label: string; value: number };

type StudyTimeBarChartCardProps = {
  title?: string | undefined;
  bars: BarItem[];
  unit?: string | undefined;
};

export default function StudyTimeBarChartCard({
  title,
  bars,
  unit,
}: StudyTimeBarChartCardProps) {
  return (
    <GoalCard tone="neutral" className="flex min-h-50 flex-col gap-6 px-6 py-6">
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
        {title}
      </h3>
      <div className="flex flex-1 items-end">
        {/* VerticalBarChart(다른 UoW 소유)는 undefined 미허용 — "h"는 자체 기본값과 동일 */}
        <VerticalBarChart bars={bars} unit={unit ?? "h"} heightRem={5} />
      </div>
    </GoalCard>
  );
}
