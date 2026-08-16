import { Navigate, Route } from "react-router";
import Callmentor from "../pages/services/Callmentor";
import GoalManagement from "../pages/services/GoalManagement";
import InDepthResearch from "../pages/services/InDepthResearch";
import PerformanceAssessment from "../pages/services/PerformanceAssessment";
import SelfAssessment from "../pages/services/SelfAssessment";

// 서비스 랜딩 4종(Figma 예시 1889:6944/1889:6486/1907:20783/1907:21352) + 구 경로 리다이렉트.
export default function serviceLandingRoutes() {
  return (
    <>
      <Route path="/services/callmentor" element={<Callmentor />} />
      {/* 구 경로 — GNB/DB services-content 슬러그가 가리키던 곳. 신규 랜딩으로 리다이렉트 */}
      <Route
        path="/page/services-content"
        element={<Navigate to="/services/callmentor" replace />}
      />

      <Route path="/services/goal" element={<GoalManagement />} />
      <Route path="/services/performance" element={<PerformanceAssessment />} />
      <Route path="/services/self-assessment" element={<SelfAssessment />} />
      <Route path="/services/research" element={<InDepthResearch />} />

      {/* 구 경로(DB page_contents 미갱신 시 잔존) → 신규 라우트로 리다이렉트 */}
      <Route
        path="/page/services-goal"
        element={<Navigate to="/services/goal" replace />}
      />
      <Route
        path="/page/services-ai-performance"
        element={<Navigate to="/services/performance" replace />}
      />
      <Route
        path="/page/services-self-assessment"
        element={<Navigate to="/services/self-assessment" replace />}
      />
      <Route
        path="/page/services-in-depth-research"
        element={<Navigate to="/services/research" replace />}
      />
      <Route
        path="/page/admission-special-highschool-results"
        element={<Navigate to="/admission/special-highschool" replace />}
      />
    </>
  );
}
