import { lazy, Suspense } from "react";
import { Navigate, Route } from "react-router";
import {
  AdminAccessBoundary,
  AdminCheckingFallback,
} from "../components/routeGuards/RouteGuardUi";
import { requireAdminMiddleware } from "../lib/routeMiddleware";
// Admin 섹션 라우트 목록 — CONFIGS(Admin.tsx, 도메인 config 8개 파일 + 폼 컴포넌트를
// 물고 있어 무겁다) 대신 이 파일만 정적으로 import한다. adminSectionKeys.ts 상단
// 주석 참고 — /admin에 들어가지 않는 사용자의 초기 번들에 CONFIGS를 얹지 않기 위함이다.
import {
  ADMIN_DEFAULT_SECTION_KEY,
  ADMIN_SECTION_KEYS,
} from "../pages/admin/adminSectionKeys";

// AdminLayout(사이드바/탑바 영속 셸)과 AdminSectionRoute(섹션 본문, section prop으로
// CONFIGS 키 하나를 받는다)는 같은 모듈(../pages/Admin)의 named export 둘이다 —
// lazy()는 default export만 받으므로 동적 import 결과에서 각각 골라 default로
// 감싼다. import() specifier가 같아 번들러가 청크 하나로 묶는다(중복 다운로드 없음).
const AdminLayout = lazy(() =>
  import("../pages/Admin").then((m) => ({ default: m.AdminLayout })),
);
const AdminSectionRoute = lazy(() =>
  import("../pages/Admin").then((m) => ({ default: m.AdminSectionRoute })),
);

// Admin.jsx 전면 route화(§5-1) — 각 CONFIGS 도메인 섹션이 실제 개별 <Route>다.
// AdminLayout(사이드바/탑바)은 부모 라우트로 한 번만 마운트되어 섹션을
// 옮겨도 유지되고, Outlet 안쪽(AdminSectionRoute)만 섹션별로 갈린다.
// ADMIN_SECTION_KEYS를 순회해 동적 생성하지만, 결과는 CONFIGS 키 46개와
// URL이 1:1로 리터럴 매칭되는 구조다(:section 같은 단일 와일드카드 아님) —
// 새 섹션은 adminSectionKeys.ts와 admin/configs/*에 함께 추가해야 한다.
export default function adminRoutes() {
  return (
    <Route
      path="/admin"
      element={
        <Suspense
          fallback={
            <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
              <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
                관리자 페이지 불러오는 중...
              </div>
            </main>
          }
        >
          <AdminLayout />
        </Suspense>
      }
      middleware={[requireAdminMiddleware]}
      HydrateFallback={AdminCheckingFallback}
      ErrorBoundary={AdminAccessBoundary}
    >
      <Route
        index
        element={
          <Navigate to={`/admin/${ADMIN_DEFAULT_SECTION_KEY}`} replace />
        }
      />
      {ADMIN_SECTION_KEYS.map((key) => (
        <Route
          key={key}
          path={key}
          element={<AdminSectionRoute section={key} />}
        />
      ))}
      {/* 존재하지 않는 섹션 키 — 이전(구 activeKey 기본값)과 동일하게 기본 섹션으로 되돌린다. */}
      <Route
        path="*"
        element={
          <Navigate to={`/admin/${ADMIN_DEFAULT_SECTION_KEY}`} replace />
        }
      />
    </Route>
  );
}
