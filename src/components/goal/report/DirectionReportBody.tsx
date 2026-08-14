import GoalPageHeader from "../GoalPageHeader";
import GoalTabs from "../GoalTabs";
import DirectionSummaryBanner from "./DirectionSummaryBanner";
import PeriodChipRow from "./PeriodChipRow";
import SubjectDirectionCard from "./SubjectDirectionCard";

const TAB_OPTIONS = [
  { value: "naesin", label: "내신 리포트" },
  { value: "jeongsi", label: "정시 리포트" },
];

// 학습방향 리포트 본문(#37 내신 / #38 정시) — 같은 컴포넌트 트리에 데이터 스키마만 다르게
// 주입한다(과목군 vs 과목, 학기 vs 모의고사 회차, 등급 vs 등급+백분위 — part-13 구현 노트).
//
// mock 제거(I단계 실배선) — 기간 칩 선택은 이제 화면 상태가 아니라 pages/goal/
// DirectionReport.jsx가 쿼리 파라미터 `period`로 소유하고, 클릭 시 실제로 그 회차의
// report(summary+subjects)를 다시 조회한다(예전엔 목업이 탭당 1세트뿐이라 클릭해도
// 데이터가 안 바뀌었다 — part-13 §152 요구사항을 이번에 채웠다).
//
// 헤더 구조(`GoalPageHeader`로 타이틀 먼저 → 탭 나중)는 성장 리포트(GrowthReportBody, 탭 먼저 →
// 타이틀 나중)와 다르다. part-13.md #37 세로 구조표가 `100 페이지 타이틀` → `216 탭` 순으로 이미
// 이 순서를 그대로 보여준다 — part-11.md #33(성장 리포트, 탭 y=106 → 타이틀 y=271)과 정반대다.
// 두 리포트 시안 자체가 다른 순서라 구현 버그가 아니라고 판단해 강제 통일하지 않고 각자 시안을
// 따른다(GrowthReportBody.jsx 상단 주석 참고).
type DirectionReport = {
  heading?: string;
  meta?: string;
  periodChips: Array<{ value: string; label: string }>;
  activePeriod?: string;
  summary: { meta?: string; typeLabel?: string; body?: string };
  subjects: Array<{
    name: string;
    zoneLabel?: string;
    badge?: string;
    body?: string;
    materials?: string[];
  }>;
};

type DirectionReportBodyProps = {
  tab: string;
  onTabChange: (value: string) => void;
  report: DirectionReport;
  onPeriodChange: (value: string) => void;
};

export default function DirectionReportBody({
  tab,
  onTabChange,
  report,
  onPeriodChange,
}: DirectionReportBodyProps) {
  return (
    <>
      <GoalPageHeader title={report.heading} meta={report.meta} />
      <div className="max-w-goal-content flex flex-col gap-7 px-[3rem] pb-24">
        <GoalTabs
          tabs={TAB_OPTIONS}
          value={tab}
          onChange={onTabChange}
          ariaLabel="리포트 유형"
          gap="1.25rem"
        />
        {report.periodChips.length > 0 && (
          <PeriodChipRow
            options={report.periodChips}
            value={report.activePeriod}
            onChange={onPeriodChange}
            ariaLabel="시험 회차 선택"
          />
        )}
        <DirectionSummaryBanner
          meta={report.summary.meta}
          typeLabel={report.summary.typeLabel}
          body={report.summary.body}
        />
        <div className="grid grid-cols-1 gap-x-[1.3125rem] gap-y-[2.5rem] xl:grid-cols-2">
          {report.subjects.map((subject) => (
            <SubjectDirectionCard key={subject.name} {...subject} />
          ))}
        </div>
      </div>
    </>
  );
}
