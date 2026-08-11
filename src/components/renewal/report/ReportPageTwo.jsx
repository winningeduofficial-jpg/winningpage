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
  const { readiness, strengths, improvements, admission, recommendations, notices } = data;

  return (
    <ReportSheetA4 page={2}>
      <ReadinessOverview scoreLabel={readiness.scoreLabel} summaryLines={readiness.summaryLines} />
      <DimensionBarChart areas={readiness.areas} />
      <InsightColumns strengths={strengths} improvements={improvements} />
      <AdmissionSection admission={admission} />
      <RecommendServices cards={recommendations} />

      {/*
        R3(2026-08-11) — notices.reportBasis(§5.1 고정 안내 "조건 없음, 항상")도 urgency 와 같은
        사정으로 렌더 슬롯이 없었다. 리포트 전체에 걸리는 신뢰성 고지라 특정 섹션이 아니라
        2페이지(마지막 페이지) 맨 아래 각주로 한 번만 둔다. reportLimit·probNote·admissionNote·
        serviceLimit·skipNote 는 이번에는 배치하지 않는다(넣지 않은 이유는 보고 참고).
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
