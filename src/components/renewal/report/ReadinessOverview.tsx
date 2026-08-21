// 2페이지 첫 섹션 — §타이틀(학교 생활 및 입시 준비도) + 종합점수 + 요약 2줄.
// props: { scoreLabel, summaryLines } — data.readiness 에서 전달.
import { withDedupedKeys } from "@/lib/reactKeys";
import ReportSection from "./ReportSection";

type ReadinessOverviewProps = {
  scoreLabel: string;
  summaryLines: string[];
};

const ReadinessOverview = ({
  scoreLabel,
  summaryLines,
}: ReadinessOverviewProps) => {
  return (
    <ReportSection title="학교 생활 및 입시 준비도" className="mt-12">
      <div className="flex items-center gap-3">
        <span className="text-[1.1875rem] font-medium text-ink">종합점수</span>
        <span className="text-[1.25rem] font-medium text-primary">
          {scoreLabel}
        </span>
      </div>

      {/* fd-readiness-summary — 인쇄 훅(BLOCK 수정). report-print.css 가 기존
          lg:w-122.25 과 동일한 값으로 강제한다. */}
      <div className="fd-readiness-summary mt-4 w-full text-base font-normal leading-[1.3] text-[#808080] lg:w-122.25">
        {withDedupedKeys(summaryLines).map(({ item: line, key }) => (
          <p key={key}>{line}</p>
        ))}
      </div>
    </ReportSection>
  );
};

export default ReadinessOverview;
