import { Navigate, Route } from "react-router";
import AdmissionBoard from "../pages/AdmissionBoard";
import AdmissionGuidelines from "../pages/AdmissionGuidelines";
import AdmissionResults from "../pages/AdmissionResults";
import AdmissionCaseDetail from "../pages/admission/AdmissionCaseDetail";
import AdmissionCases from "../pages/admission/AdmissionCases";
import SpecialHighschoolCases from "../pages/special/SpecialHighschoolCases";

export default function admissionRoutes() {
  return (
    <>
      <Route path="/admission/guidelines" element={<AdmissionGuidelines />} />
      <Route path="/admission/results" element={<AdmissionResults />} />

      {/* 수시와 정시는 각각 자신의 category만 조회합니다. */}
      <Route path="/admission/susi" element={<AdmissionCases />} />
      <Route path="/admission/jungsi" element={<AdmissionCases />} />
      <Route path="/admission/susi/:id" element={<AdmissionCaseDetail />} />
      <Route path="/admission/jungsi/:id" element={<AdmissionCaseDetail />} />

      {/* 메인 합격생 카드에서 사용하는 통합 상세 주소는 유지합니다. */}
      <Route
        path="/admission/susi-jungsi/:id"
        element={<AdmissionCaseDetail />}
      />
      <Route
        path="/admission/susi-jungsi"
        element={<Navigate to="/admission/susi" replace />}
      />

      {/* 특목고합격 — 카드가 링크가 아니라 상세 라우트는 두지 않는다(시안 2239:1559에 상세 없음). */}
      <Route
        path="/admission/special-highschool"
        element={<SpecialHighschoolCases />}
      />

      <Route path="/admission/essay" element={<AdmissionBoard />} />
      <Route path="/admission/essay/:id" element={<AdmissionBoard />} />
      <Route path="/admission/:category" element={<AdmissionBoard />} />
      <Route path="/admission/:category/:id" element={<AdmissionBoard />} />
    </>
  );
}
