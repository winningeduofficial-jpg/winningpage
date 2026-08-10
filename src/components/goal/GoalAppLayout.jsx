import { Outlet } from 'react-router-dom';
import GoalSidebar from './GoalSidebar';

// TODO(goal-app-shell): 접근 가드 미정 — ①결제 게이트(../../lib/paidServiceAccess.js의
// PAID_SERVICE_CONFIGS `goal` 항목) 적용 여부, ②온보딩 미완료 학생을 `/app/goal/onboarding`으로
// 리다이렉트하는 규칙이 아직 확정되지 않았다(docs/figma-goal/00-INDEX.md §7-3 "설계 근거·주의").
// 확정되면 이 레이아웃 상단에서 세션/온보딩 상태를 검사해 <Navigate>로 처리한다.

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
