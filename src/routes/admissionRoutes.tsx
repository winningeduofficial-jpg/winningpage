import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import { AuthCheckingFallback } from "@/components/routeGuards/RouteGuardUi";
import { requireAuthMiddleware } from "@/lib/routeMiddleware";
import AdmissionBoard from "@/pages/AdmissionBoard";
import AdmissionGuidelines from "@/pages/AdmissionGuidelines";
import AdmissionResults from "@/pages/AdmissionResults";
import AdmissionCaseDetail from "@/pages/admission/AdmissionCaseDetail";
import AdmissionCases from "@/pages/admission/AdmissionCases";
import SpecialHighschoolCases from "@/pages/special/SpecialHighschoolCases";

const admissionRoutes: RouteObject[] = [
  // 비회원 진입 차단(QA 행353) — diagnosisRoutes.tsx의 /app/learning-diagnosis/survey와
  // 동일한 requireAuthMiddleware를 재사용해 비회원을 /login?redirect=...로 보낸다.
  {
    path: "/admission/guidelines",
    Component: AdmissionGuidelines,
    middleware: [requireAuthMiddleware],
    HydrateFallback: AuthCheckingFallback,
  },
  {
    path: "/admission/results",
    Component: AdmissionResults,
    middleware: [requireAuthMiddleware],
    HydrateFallback: AuthCheckingFallback,
  },

  // 수시와 정시는 각각 자신의 category만 조회합니다.
  { path: "/admission/susi", Component: AdmissionCases },
  { path: "/admission/jungsi", Component: AdmissionCases },
  { path: "/admission/susi/:id", Component: AdmissionCaseDetail },
  { path: "/admission/jungsi/:id", Component: AdmissionCaseDetail },

  // 메인 합격생 카드에서 사용하는 통합 상세 주소는 유지합니다.
  { path: "/admission/susi-jungsi/:id", Component: AdmissionCaseDetail },
  {
    path: "/admission/susi-jungsi",
    Component: () => <Navigate to="/admission/susi" replace />,
  },

  // 특목고합격 — 카드가 링크가 아니라 상세 라우트는 두지 않는다(시안 2239:1559에 상세 없음).
  {
    path: "/admission/special-highschool",
    Component: SpecialHighschoolCases,
  },

  { path: "/admission/essay", Component: AdmissionBoard },
  { path: "/admission/essay/:id", Component: AdmissionBoard },
  { path: "/admission/:category", Component: AdmissionBoard },
  { path: "/admission/:category/:id", Component: AdmissionBoard },
];

export default admissionRoutes;
