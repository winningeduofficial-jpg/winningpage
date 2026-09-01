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
    // className 비움(2026-08-21) — 이 섹션은 항상 시트2의 첫 줄(준비도·입결 비교 2단
    // 스플릿의 왼쪽 단)이라 섹션 상단 마진을 갖지 않는다. 라벨→첫 콘텐츠 간격은
    // ReportSheetA4가 소유한다(46px 캐노니컬) — 종전 mt-12(48px)는 이중 소유였다.
    <ReportSection title="학교 생활 및 입시 준비도" className="">
      <div className="flex items-center gap-3">
        <span className="text-[1.1875rem] font-medium leading-5 text-ink">
          종합점수
        </span>
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
