import { Outlet } from "react-router";
import {
  AppShellSidebarProvider,
  AppShellSidebarTrigger,
} from "@/components/app-shell/AppShellSidebar";
import Header from "@/components/Header";
import RouteLoadingOverlay from "@/components/ui/RouteLoadingOverlay";
import GoalSidebar from "./GoalSidebar";

// 접근 가드(로그인 → 이용권 → 온보딩 완료) 확정(2026-08-10) — App.jsx에서 이 레이아웃의
// 라우트 그룹에 middleware(src/lib/routeMiddleware.ts)를 건다(2026-08-15 컴포넌트 가드 →
// middleware 이관). 이 컴포넌트 자체는 셸(사이드바+본문)만 담당하고 가드 로직은 갖지 않는다.

// 목표관리 앱(로그인 후 서비스) 전용 셸 — docs/figma-goal/00-INDEX.md §5-1.
// 마케팅 사이트 공통 푸터(SiteFooter.jsx)는 여전히 쓰지 않는다(시안 #12~#44 전부 미포함).
// `/mypage`·`/admin`이 SiteLayout 밖에 라우트 그룹으로 배치된 선례를 따라 App.jsx에서 이
// 레이아웃도 SiteLayout 밖에 별도 그룹으로 둔다.
//
// (2026-09-06 개정) 공통 헤더 도입 + shadcn Sidebar 전환(사용자 결정
// "목표관리/수행평가 다 같은 스타일로") — 마케팅 사이트 공통 헤더(Header.jsx)는 원래
// 이 셸에 없었지만, 수행평가 셸(PerformanceAppLayout.tsx)이 먼저 붙인 시안(Figma
// 3754-3562, QA 행279)이 목표관리에도 그대로 적용되며 이 셸에도 붙는다 — 헤더
// 로고·메뉴가 사이드바의 옛 "메인으로" 링크를 대신한다(goalNavItems.ts 주석 참고).
// 사이드바 고정(스크롤해도 화면에 붙어 있음)·모바일 Sheet 전환은 이제
// AppShellSidebarProvider/GoalSidebar(→ AppShellSidebar)가 수행평가와 공유하는 한
// 곳(app-shell/AppShellSidebar.tsx)에서 처리한다 — 이 컴포넌트는 그 프로바이더로
// 감싸고 본문에 헤더 높이(pt-16)·사이드바 폭(md:ml-app-sidebar) 여백만 준다.
export default function GoalAppLayout() {
  return (
    <>
      <Header />
      <AppShellSidebarProvider>
        <div className="flex min-h-screen w-full bg-white pt-16">
          <GoalSidebar />
          <AppShellSidebarTrigger />

          {/* relative: RouteLoadingOverlay(소프트 내비게이션 로딩 표시,
              goal-mapping.md 행297)가 사이드바는 가리지 않고 본문 영역에만
              덮이도록 하는 기준 컨테이너. md 이상에서 고정 사이드바 폭만큼 좌측
              여백을 준다(AppShellSidebar가 사이드바를 문서 흐름 밖으로 fixed
              처리하므로 이 margin이 없으면 본문이 사이드바 밑에 깔린다). */}
          <main className="relative min-w-0 flex-1 md:ml-app-sidebar">
            <RouteLoadingOverlay />
            <Outlet />
          </main>
        </div>
      </AppShellSidebarProvider>
    </>
  );
}
