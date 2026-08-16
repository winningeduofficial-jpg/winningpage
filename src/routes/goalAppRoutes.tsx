import { Route } from "react-router";
// 목표관리 학생 앱(goal-app-shell) — 사이드바 셸 + 서브페이지 10종. docs/figma-goal/00-INDEX.md
// §5-1 기준 마케팅 헤더/푸터를 쓰지 않는 별개 앱 셸이라 `/mypage`·`/admin`과 같은 방식으로
// SiteLayout 밖에 라우트 그룹으로 둔다. `/app/goal` 접두어는 `/services/goal`(마케팅 상세)과
// 명사 충돌을 막기 위함 — 마케팅 상세와는 별개 라우트.
import GoalAppLayout from "../components/goal/GoalAppLayout";
import {
  GoalAccessBoundary,
  GoalAccessCheckingFallback,
} from "../components/routeGuards/RouteGuardUi";
import {
  requireGoalAccessMiddleware,
  requireGoalOnboardingDoneMiddleware,
} from "../lib/routeMiddleware";
import GoalDailyRecord from "../pages/goal/DailyRecord";
import GoalDashboard from "../pages/goal/Dashboard";
import GoalDirectionReport from "../pages/goal/DirectionReport";
import GoalEfforts from "../pages/goal/Efforts";
import GoalGrades from "../pages/goal/Grades";
import GoalGrowthReport from "../pages/goal/GrowthReport";
import GoalProfile from "../pages/goal/Profile";
import GoalSchedules from "../pages/goal/Schedules";
import GoalTargetUniversity from "../pages/goal/TargetUniversity";
import GoalTimer from "../pages/goal/Timer";
import GoalWeeklyPlan from "../pages/goal/WeeklyPlan";

// 목표관리 학생 앱 — 사이드바 셸(GoalAppLayout) 그룹. 진입 가드(로그인 → 이용권 →
// 온보딩 완료 → 대시보드)는 middleware 체인이 소유한다(2026-08-10 확정,
// 2026-08-15 middleware로 이관 — src/lib/routeMiddleware.ts). 온보딩 완료
// 판정(requireGoalOnboardingDoneMiddleware)은 이 그룹에만 걸고 온보딩 라우트
// 그룹(goalOnboardingRoutes)에는 걸지 않는다 — 무한 리다이렉트 방지가 런타임 pathname 체크가
// 아니라 라우트 트리 구조 자체로 보장된다(routeMiddleware.ts 주석 참고).
export default function goalAppRoutes() {
  return (
    <Route
      middleware={[requireGoalAccessMiddleware]}
      HydrateFallback={GoalAccessCheckingFallback}
      ErrorBoundary={GoalAccessBoundary}
    >
      <Route
        middleware={[requireGoalOnboardingDoneMiddleware]}
        HydrateFallback={GoalAccessCheckingFallback}
        ErrorBoundary={GoalAccessBoundary}
        element={<GoalAppLayout />}
      >
        <Route path="/app/goal" element={<GoalDashboard />} />
        <Route
          path="/app/goal/target-university"
          element={<GoalTargetUniversity />}
        />
        <Route path="/app/goal/timer" element={<GoalTimer />} />
        <Route path="/app/goal/daily-record" element={<GoalDailyRecord />} />
        <Route path="/app/goal/weekly-plan" element={<GoalWeeklyPlan />} />
        <Route path="/app/goal/efforts" element={<GoalEfforts />} />
        <Route path="/app/goal/reports/growth" element={<GoalGrowthReport />} />
        <Route path="/app/goal/grades" element={<GoalGrades />} />
        <Route
          path="/app/goal/reports/direction"
          element={<GoalDirectionReport />}
        />
        <Route path="/app/goal/schedules" element={<GoalSchedules />} />
        <Route path="/app/goal/profile" element={<GoalProfile />} />
      </Route>
    </Route>
  );
}
