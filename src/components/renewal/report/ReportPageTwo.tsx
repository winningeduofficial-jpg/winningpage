import AdmissionSection from "./AdmissionSection";
import DimensionBarChart from "./DimensionBarChart";
import InsightColumns from "./InsightColumns";
import ReadinessOverview from "./ReadinessOverview";
import RecommendServices from "./RecommendServices";
import ReportSheetA4 from "./ReportSheetA4";

type ReportPageTwoProps = {
  data: {
    readiness: {
      scoreLabel: string;
      summaryLines: string[];
      areas: Array<{
        name: string;
        score: number;
        tone?: string;
        status?: string;
      }>;
    };
    strengths: string[];
    improvements: string[];
    admission: unknown;
    recommendations: Array<{
      rank?: string;
      name?: string;
      desc?: string;
      chips: string[];
    }>;
    notices?: {
      serviceLimit?: string | null;
      reportBasis?: string | null;
    };
  };
};

// 결과 리포트 2페이지(A4-4) — 학교 생활 및 입시 준비도 / 6영역 바 그래프 /
// 잘하고 있는 부분·보완할 부분 / 목표 대학 입결 비교 / 추천 지원 서비스.
// 전 섹션 static 카피 없음 — data prop 하나에서 하향 주입(props 계약 준수).
const ReportPageTwo = ({ data }: ReportPageTwoProps) => {
  const {
    readiness,
    strengths,
    improvements,
    admission,
    recommendations,
    notices,
  } = data;

  return (
    <ReportSheetA4 page={2}>
      <ReadinessOverview
        scoreLabel={readiness.scoreLabel}
        summaryLines={readiness.summaryLines}
      />
      <DimensionBarChart areas={readiness.areas} />
      <InsightColumns strengths={strengths} improvements={improvements} />
      <AdmissionSection admission={admission} />
      <RecommendServices
        cards={recommendations}
        leadNote={notices?.serviceLimit}
      />

      {/*
        R3(2026-08-11) — notices.reportBasis(§5.1 고정 안내 "조건 없음, 항상")도 urgency 와 같은
        사정으로 렌더 슬롯이 없었다. 리포트 전체에 걸리는 신뢰성 고지라 특정 섹션이 아니라
        2페이지(마지막 페이지) 맨 아래 각주로 한 번만 둔다.

        (2026-08-11 갱신) 나머지 고지도 전부 자리를 찾았다 — probNote·admissionNote 는
        AdmissionSection 안(값·표 바로 옆), serviceLimit 은 RecommendServices 리드,
        skipNote·reportLimit 은 화면 전용 확장 영역(ReportScreenExtras)이다. 이 각주(reportBasis)
        만 인쇄에 남는다. 새 고지가 생기면 여기 쌓지 말고 의미상 소속 섹션을 먼저 찾아라.
      */}
      {/* WARN-2 — urgency.message 와 동일 사유로 #6b6b6b(대비 ≈5.34:1) 재사용. 이미 있는
          border-t 구분선과 함께 각주 위계를 색·경계선 이중으로 드러낸다. */}
      {notices?.reportBasis && (
        <p className="fd-mt-report-basis mt-8 border-t border-[#e5e5e5] pt-3 text-sm leading-[1.4] text-[#6b6b6b] lg:mt-6">
          {notices.reportBasis}
        </p>
      )}
    </ReportSheetA4>
  );
};

export default ReportPageTwo;
