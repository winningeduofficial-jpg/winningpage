import ReportSheetA4 from './ReportSheetA4';
import ReadinessOverview from './ReadinessOverview';
import DimensionBarChart from './DimensionBarChart';
import InsightColumns from './InsightColumns';
import AdmissionSection from './AdmissionSection';
import RecommendServices from './RecommendServices';

// 결과 리포트 2페이지(A4-4) — 학교 생활 및 입시 준비도 / 6영역 바 그래프 /
// 잘하고 있는 부분·보완할 부분 / 목표 대학 입결 비교 / 추천 지원 서비스.
// 전 섹션 static 카피 없음 — data prop 하나에서 하향 주입(props 계약 준수).
const ReportPageTwo = ({ data }) => {
  const { readiness, strengths, improvements, admission, recommendations } = data;

  return (
    <ReportSheetA4 page={2}>
      <ReadinessOverview scoreLabel={readiness.scoreLabel} summaryLines={readiness.summaryLines} />
      <DimensionBarChart areas={readiness.areas} />
      <InsightColumns strengths={strengths} improvements={improvements} />
      <AdmissionSection admission={admission} />
      <RecommendServices cards={recommendations} />
    </ReportSheetA4>
  );
};

export default ReportPageTwo;
