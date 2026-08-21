import AdmissionSection, { type AdmissionData } from "./AdmissionSection";
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
    admission: AdmissionData;
    recommendations: Array<{
      rank?: string;
      name?: string;
      desc?: string;
      chips: string[];
    }>;
    notices?: {
      traitIntro?: string | null;
      hexCaption?: string | null;
      goalCompare?: string | null;
      reportBasis?: string | null;
      reportLimit?: string | null;
      probNote?: string | null;
      admissionNote?: string | null;
      serviceLimit?: string | null;
      skipNote?: string | null;
      sincerityBanner?: string | null;
      sincerityAct?: string | null;
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
      {/* exactOptionalPropertyTypes 대응 — undefined일 때 leadNote 키 생략(RecommendServices 미수정 범위). */}
      <RecommendServices
        cards={recommendations}
        {...(notices?.serviceLimit !== undefined
          ? { leadNote: notices.serviceLimit }
          : {})}
      />

      {/*
        notices.reportBasis(산출 근거 고지)는 원래 여기(2페이지 하단) 각주였으나, 부록이
        인쇄에 포함되면서(행 102) 2페이지가 더 이상 문서의 끝이 아니게 됐다 — 사용자 지시
        (2026-08-21)로 문서 전체의 맨 끝(ReportScreenExtras 하단)으로 이동했다.
        새 고지가 생기면 여기 쌓지 말고 의미상 소속 섹션을 먼저 찾아라.
      */}
    </ReportSheetA4>
  );
};

export default ReportPageTwo;
