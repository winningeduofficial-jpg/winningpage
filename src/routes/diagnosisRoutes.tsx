import { Navigate, Route } from "react-router";
import LearningDiagnosisLanding from "../pages/renewal/LearningDiagnosisLanding";
import SurveyPreview from "../pages/renewal/SurveyPreview";
import SurveyStepPage from "../pages/renewal/SurveyStepPage";
import SurveyStepShell from "../pages/renewal/SurveyStepShell";

// 학습진단 6종 URL 통일 규칙 정본(2026-08-10) — 소개(마케팅) 페이지는
// /services/{slug}(자식 = /services 목록 페이지), 앱(이용 화면)은 /app/{slug}/...
// 목표관리(/app/goal/*)에 이어 학습진단도 이 규칙으로 이관했다.
export default function diagnosisRoutes() {
  return (
    <>
      <Route
        path="/services/learning-diagnosis"
        element={<LearningDiagnosisLanding />}
      />
      {/* ⚠️ 설계 리스크 — 이 화면은 무료·체험 성격이라 로그인 없이 접근 가능해야 할 수 있다.
              추후 /app/* 전체에 일괄 로그인 가드를 걸 때 이 라우트를 예외 처리해야 한다(이번
              단계에서는 가드 자체를 구현하지 않는다). */}
      <Route
        path="/app/learning-diagnosis/survey"
        element={<SurveyStepShell />}
      >
        {/* /survey 진입은 스텝1로 명시 리다이렉트. 없으면 최하단 catch-all 이 홈으로 삼킨다. */}
        <Route
          index
          element={<Navigate to="/app/learning-diagnosis/survey/1" replace />}
        />
        {/* 정적 세그먼트를 :step 보다 먼저 선언 — v6 랭킹상 정적이 우선이지만 의도를 코드로 고정한다. */}
        <Route path="preview" element={<SurveyPreview />} />
        <Route path=":step" element={<SurveyStepPage />} />
        {/* /survey/1/2 같은 초과 세그먼트 방어. 반드시 마지막. */}
        <Route
          path="*"
          element={<Navigate to="/app/learning-diagnosis/survey/1" replace />}
        />
      </Route>

      {/* 구 경로 4종 호환. 외부 링크·북마크 보호용이라 영구 유지한다.
              /free-diagnosis 계열은 원래 /learning-diagnosis로 2홉 리다이렉트였으나, 목적지가
              신 경로로 바뀌면서 함께 갱신 — 항상 신 경로로 1홉만 거치도록 유지한다. */}
      <Route
        path="/learning-diagnosis"
        element={<Navigate to="/services/learning-diagnosis" replace />}
      />
      <Route
        path="/learning-diagnosis/survey"
        element={<Navigate to="/app/learning-diagnosis/survey" replace />}
      />
      <Route
        path="/free-diagnosis"
        element={<Navigate to="/services/learning-diagnosis" replace />}
      />
      <Route
        path="/free-diagnosis/survey"
        element={<Navigate to="/app/learning-diagnosis/survey" replace />}
      />
      <Route
        path="/free-diagnosis/report"
        element={<Navigate to="/learning-diagnosis/report" replace />}
      />
    </>
  );
}
