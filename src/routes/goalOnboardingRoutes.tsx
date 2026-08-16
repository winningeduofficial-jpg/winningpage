import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import {
  GoalAccessBoundary,
  GoalAccessCheckingFallback,
} from "../components/routeGuards/RouteGuardUi";
import { requireGoalAccessMiddleware } from "../lib/routeMiddleware";
import GoalOnboarding from "../pages/goal/Onboarding";

// 목표관리 온보딩(설문 7단계) — 시안상 공통 헤더/푸터가 있고 사이드바가 없어
// SiteLayout 안에 둔다(GoalAppLayout 사이드바 셸에는 넣지 않는다). RequireGoalAccess가
// 로그인・이용권 판정을 적용하되, 온보딩 경로 자체는 3단계(온보딩 완료 판정)를
// 건너뛴다 — 자세한 이유는 RequireGoalAccess.jsx 상단 주석 참고.
const goalOnboardingRoutes: RouteObject[] = [
  {
    middleware: [requireGoalAccessMiddleware],
    HydrateFallback: GoalAccessCheckingFallback,
    ErrorBoundary: GoalAccessBoundary,
    children: [
      {
        path: "/app/goal/onboarding",
        Component: () => <Navigate to="/app/goal/onboarding/step-1" replace />,
      },
      { path: "/app/goal/onboarding/:step", Component: GoalOnboarding },
    ],
  },
];

export default goalOnboardingRoutes;
