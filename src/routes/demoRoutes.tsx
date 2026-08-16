import { lazy, Suspense } from "react";
import { Route } from "react-router";
import {
  AdminAccessBoundary,
  AdminCheckingFallback,
} from "../components/routeGuards/RouteGuardUi";
import { requireAdminMiddleware } from "../lib/routeMiddleware";

// 고객사 HTML 목업 5종 데모 라우트 — lazy가 핵심이다. 가드(ProtectedAdmin)를 통과하기 전엔
// HTML 문자열이 든 청크를 네트워크에서 받지도 않는다.
const DemoIndex = lazy(() => import("../pages/demo/DemoIndex"));
const DemoFrame = lazy(() => import("../pages/demo/DemoFrame"));

// 데모 라우트 공용 Suspense fallback — /admin 것과 같은 스타일로 맞춘다.
function DemoFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
        데모 페이지 불러오는 중...
      </div>
    </main>
  );
}

// /demo, /demo/:demoKey — 고객사 목업 데모 원문(어드민 전용). SiteLayout 밖(/admin과
// 같은 층위)에 둔다. 자체 크롬(헤더/푸터 또는 전체화면 앱 UI)을 갖고 있어 사이트
// 헤더/푸터와 겹치면 크롬이 이중화된다.
//
// /services/growth — 서비스 랜딩 중 하나로 비로그인 포함 전원 공개. 렌더하는 실체는
// 고객사 제공 HTML 목업(growth-intro)이라 위 /demo 라우트들과 같은 이유로 SiteLayout
// 밖에 두지만, 접근 통제는 걸지 않는다.
export default function demoRoutes() {
  return (
    <>
      <Route
        path="/demo"
        element={
          <Suspense fallback={<DemoFallback />}>
            <DemoIndex />
          </Suspense>
        }
        middleware={[requireAdminMiddleware]}
        HydrateFallback={AdminCheckingFallback}
        ErrorBoundary={AdminAccessBoundary}
      />
      <Route
        path="/demo/:demoKey"
        element={
          <Suspense fallback={<DemoFallback />}>
            <DemoFrame />
          </Suspense>
        }
        middleware={[requireAdminMiddleware]}
        HydrateFallback={AdminCheckingFallback}
        ErrorBoundary={AdminAccessBoundary}
      />

      <Route
        path="/services/growth"
        element={
          <Suspense fallback={<DemoFallback />}>
            <DemoFrame demoKeyOverride="growth-intro" />
          </Suspense>
        }
      />
    </>
  );
}
