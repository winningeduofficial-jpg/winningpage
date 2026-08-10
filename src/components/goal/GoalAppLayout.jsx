import { Outlet } from 'react-router-dom';
import GoalSidebar from './GoalSidebar';

// 접근 가드(로그인 → 이용권 → 온보딩 완료) 확정(2026-08-10) — App.jsx에서 이 레이아웃의
// 라우트 그룹을 <RequireGoalAccess />로 감싼다(src/components/goal/RequireGoalAccess.jsx).
// 이 컴포넌트 자체는 셸(사이드바+본문)만 담당하고 가드 로직은 갖지 않는다.

// 목표관리 앱(로그인 후 서비스) 전용 셸 — docs/figma-goal/00-INDEX.md §5-1.
// 마케팅 사이트 공통 헤더(Header.jsx)·푸터(SiteFooter.jsx)를 쓰지 않는다(시안 #12~#44 전부 미포함).
// `/mypage`·`/admin`이 SiteLayout 밖에 라우트 그룹으로 배치된 선례를 따라 App.jsx에서 이 레이아웃도
// SiteLayout 밖에 별도 그룹으로 둔다.
export default function GoalAppLayout() {
  return (
    <div className="flex min-h-screen bg-white">
      <GoalSidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
