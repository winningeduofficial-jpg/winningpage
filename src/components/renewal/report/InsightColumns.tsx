// 잘하고 있는 부분(3) / 보완할 부분(4) 2열 리스트.
// props: { strengths, improvements } — 문자열 배열.
// R3(2026-08-11) — 2열 고정폭(30.875rem×2 ≈ 988px)은 모바일에서 세로 스택으로 바뀐다.
import { withDedupedKeys } from "@/lib/reactKeys";
import ReportSection from "./ReportSection";

type InsightColumnsProps = {
  strengths: string[];
  improvements: string[];
};

const InsightColumns = ({ strengths, improvements }: InsightColumnsProps) => {
  return (
    // fd-insight-columns — 인쇄 훅(BLOCK 수정). report-print.css 가 기존 lg: 리터럴과
    // 동일한 값으로 강제한다. mt-12(2026-08-21) — 섹션 상단 마진 통일(완료 보고 표 근거)로
    // 종전 mt-10 lg:mt-18 대신 다른 섹션과 같은 값을 쓴다 — lg: 분기가 없어져 print CSS의
    // margin-top 강제 규칙도 제거했다(grid-template-columns/gap 규칙은 유지).
    <div className="fd-insight-columns mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[30.875rem_30.875rem] lg:gap-x-4 lg:gap-y-0">
      {/* 두 제목("잘하고 있는 부분"·"보완할 부분")이 그리드 셀 최상단에서 나란히 시작해야
          해서(2026-08-21 지시) ReportSection에 섹션 상단 마진을 주지 않는다 — 정렬은 이
          그리드 자신의 margin-top(위) 하나로만 맞춘다. */}
      <ReportSection title="잘하고 있는 부분" as="h3">
        <ul className="flex flex-col gap-3 list-disc ps-4.5">
          {withDedupedKeys(strengths).map(({ item, key }) => (
            <li
              key={key}
              className="text-[1.1875rem] font-normal leading-[1.3] text-[#808080]"
            >
              {item}
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title="보완할 부분" as="h3">
        <ul className="flex flex-col gap-3 list-disc ps-4.5">
          {withDedupedKeys(improvements).map(({ item, key }) => (
            <li
              key={key}
              className="text-[1.1875rem] font-normal leading-[1.3] text-[#808080]"
            >
              {item}
            </li>
          ))}
        </ul>
      </ReportSection>
    </div>
  );
};

export default InsightColumns;
