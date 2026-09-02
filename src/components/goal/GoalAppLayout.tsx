import { Outlet } from "react-router";
import RouteLoadingOverlay from "@/components/ui/RouteLoadingOverlay";
import GoalSidebar from "./GoalSidebar";

// 접근 가드(로그인 → 이용권 → 온보딩 완료) 확정(2026-08-10) — App.jsx에서 이 레이아웃의
// 라우트 그룹에 middleware(src/lib/routeMiddleware.ts)를 건다(2026-08-15 컴포넌트 가드 →
// middleware 이관). 이 컴포넌트 자체는 셸(사이드바+본문)만 담당하고 가드 로직은 갖지 않는다.

// 목표관리 앱(로그인 후 서비스) 전용 셸 — docs/figma-goal/00-INDEX.md §5-1.
// 마케팅 사이트 공통 헤더(Header.jsx)·푸터(SiteFooter.jsx)를 쓰지 않는다(시안 #12~#44 전부 미포함).
// `/mypage`·`/admin`이 SiteLayout 밖에 라우트 그룹으로 배치된 선례를 따라 App.jsx에서 이 레이아웃도
// SiteLayout 밖에 별도 그룹으로 둔다.
export default function GoalAppLayout() {
  return (
    // 모바일(< md)은 상단 앱바 + 본문 세로 스택, 데스크톱(>= md)은 고정 사이드바 +
    // 본문 가로 배치 — GoalSidebar 내부가 반응형으로 앱바/드로어 vs aside를 갈라
    // 렌더하므로 이 컨테이너는 방향만 바꿔주면 된다.
    <div className="flex min-h-screen flex-col bg-white md:flex-row">
      <GoalSidebar />
      {/* relative: RouteLoadingOverlay(소프트 내비게이션 로딩 표시,
          goal-mapping.md 행297)가 사이드바는 가리지 않고 본문 영역에만
          덮이도록 하는 기준 컨테이너. */}
      <main className="relative min-w-0 flex-1">
        <RouteLoadingOverlay />
        <Outlet />
      </main>
    </div>
  );
}
