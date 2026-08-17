import { useEffect } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
  RouterProvider,
  useLocation,
} from "react-router";
import SiteLayout from "./components/SiteLayout";
import adminRoutes from "./routes/adminRoutes";
import admissionRoutes from "./routes/admissionRoutes";
import applyRoutes from "./routes/applyRoutes";
import authRoutes from "./routes/authRoutes";
import contentRoutes from "./routes/contentRoutes";
import demoRoutes from "./routes/demoRoutes";
import diagnosisRoutes from "./routes/diagnosisRoutes";
import dynamicPageRoutes from "./routes/dynamicPageRoutes";
import goalAppRoutes from "./routes/goalAppRoutes";
import goalOnboardingRoutes from "./routes/goalOnboardingRoutes";
import homeRoutes from "./routes/homeRoutes";
import mypageRoutes from "./routes/mypageRoutes";
import performanceAppRoutes from "./routes/performanceAppRoutes";
import serviceLandingRoutes from "./routes/serviceLandingRoutes";
import standaloneRoutes from "./routes/standaloneRoutes";
import termsRoutes from "./routes/termsRoutes";

// 라우트 이동 시 페이지 최상단으로 스크롤 (해시 앵커 이동은 예외)
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) pathname은 effect 안에서 읽지 않는 트리거 전용 값 — 라우트가 바뀔 때마다 스크롤을 맨 위로 되돌리기 위한 재실행 신호다.
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

// 데이터 라우터 루트 — 모든 라우트 그룹에 공통으로 적용되던 ScrollToTop을
// 트리 최상단 레이아웃 라우트로 옮겼다(예전엔 <BrowserRouter> 바로 아래
// <Routes>의 형제였다. 데이터 라우터는 RouterProvider 바깥에 임의 형제를 둘 수
// 없어 라우트 엘리먼트 안으로 편입해야 한다).
function RootLayout() {
  return (
    <>
      <ScrollToTop />
      <Outlet />
    </>
  );
}

const routes: RouteObject[] = [
  {
    Component: RootLayout,
    children: [
      {
        Component: SiteLayout,
        children: [
          ...homeRoutes,
          ...diagnosisRoutes,
          ...goalOnboardingRoutes,
          ...serviceLandingRoutes,
          ...admissionRoutes,
          ...contentRoutes,
          ...applyRoutes,
          ...dynamicPageRoutes,
          ...authRoutes,
          ...termsRoutes,
          ...mypageRoutes,
        ],
      },

      // 목표관리 학생 앱 — 사이드바 셸(GoalAppLayout) 그룹. SiteLayout 밖.
      ...goalAppRoutes,

      // 수행평가 학생 앱 — SessionProvider/RequireEntitlement 셸. SiteLayout 밖.
      ...performanceAppRoutes,

      ...standaloneRoutes,

      ...adminRoutes,

      ...demoRoutes,

      { path: "*", Component: () => <Navigate to="/" replace /> },
    ],
  },
];

// middleware(가드 3종의 판정 로직, src/lib/routeMiddleware.ts)는 v8부터 기본
// 활성화라 future.v8_middleware 옵션 자체가 사라졌다(react-router 8.3.0, 2026-08-15 범프).
const router = createBrowserRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
