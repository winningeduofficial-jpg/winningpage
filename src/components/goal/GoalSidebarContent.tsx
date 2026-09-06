import { Link, useLocation } from "react-router";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { GoalStudentPayload } from "@/lib/goalApi";
import { GOAL_NAV_FOOTER, GOAL_NAV_GROUPS } from "./goalNavItems";

type GoalSidebarContentProps = {
  profile: GoalStudentPayload["profile"] | null;
  navBadgeData: {
    scheduleCount: number;
    dailyRecordDone: boolean;
    timerRunning: boolean;
  };
  // 모바일 드로어에서 링크 클릭 시 드로어를 닫는 콜백 — 데스크톱에서는 넘기지 않는다
  // (닫을 드로어가 없으므로 no-op). shadcn Sidebar의 내장 모바일 Sheet는 라우트
  // 전환 시 스스로 닫히지 않으므로(offcanvas Sheet는 명시적 onOpenChange로만 닫힌다)
  // 이 콜백이 여전히 필요하다.
  onNavigate?: () => void;
};

// 경로 활성 판정 — 시안·이전 구현(NavLink 기본 매칭)과 같은 규칙이다: `end`면
// 정확히 일치, 아니면 prefix까지 포함. 수행평가 사이드바(PerformanceSidebar.tsx)가
// `Link` + 커스텀 aria-current로 옮겨간 것과 같은 이유(NavLink는 `aria-current` prop을
// 라우터 자체 매칭으로 다시 계산해 버려 커스텀 판정과 어긋날 수 있다)로 여기도 `Link`를
// 쓴다 — 두 사이드바가 이제 같은 shadcn 구조를 공유하므로 활성 판정 방식도 맞춘다.
function isNavItemActive(pathname: string, to: string, end: boolean) {
  return end
    ? pathname === to
    : pathname === to || pathname.startsWith(`${to}/`);
}

// GoalSidebar의 마크업 내용부만 분리한 순수 표시 컴포넌트 — 데스크톱 고정 사이드바와
// 모바일 Sheet 드로어(AppShellSidebar.tsx가 shadcn Sidebar를 통해 자동으로 갈라 렌더한다)
// 양쪽에서 이 컴포넌트를 그대로 재사용해 내비 마크업이 두 곳에 중복되지 않는다. 데이터
// 조회·폴링(프로필 쿼리·타이머·하트비트·중요일정 카운트)은 여전히 GoalSidebar가 전담한다
// — 이 컴포넌트가 직접 조회하면 데스크톱/모바일 두 인스턴스가 동시에 마운트될 때(반응형은
// shadcn 내부에서 JS `isMobile` 분기로 전환하므로 순간적으로 두 트리가 겹칠 수 있다)
// 폴링·하트비트가 이중으로 나간다.
export default function GoalSidebarContent({
  profile,
  navBadgeData,
  onNavigate,
}: GoalSidebarContentProps) {
  const { pathname } = useLocation();

  return (
    <>
      {/* 사용자 블록 — 수행평가 사이드바(PerformanceSidebar.tsx)와 타이포를 맞췄다:
          이름 1.125rem/w700(font-bold)/ink-strong, 부제 0.875rem/w400/ink-sub, gap
          mt-2(0.5rem). 로딩 중·이름 없음은 "나의 목표관리"로 폴백한다. */}
      <SidebarHeader className="px-6 pt-6">
        <p className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
          {profile?.name ? `${profile.name}의 목표관리` : "나의 목표관리"}
        </p>
        <p className="mt-2 text-[0.875rem] leading-[1.4] text-ink-sub">
          {profile ? `${profile.grade}・${profile.schoolType}` : ""}
        </p>
      </SidebarHeader>

      {/* 내비 4그룹 10항목. */}
      <SidebarContent className="px-4">
        {GOAL_NAV_GROUPS.map(({ group, items }) => (
          <SidebarGroup key={group} className="px-0">
            <SidebarGroupLabel className="h-auto px-2 text-[0.8125rem] font-medium leading-[1.4] text-ink-sub">
              {group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {items.map((item) => {
                  const end = item.to === "/app/goal";
                  const isActive = isNavItemActive(pathname, item.to, end);
                  const badge = item.getBadge?.(navBadgeData);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        isActive={isActive}
                        className="h-9 px-3 text-[0.875rem] leading-[1.4] text-ink data-active:bg-sidebar-accent data-active:font-semibold data-active:text-ink-strong hover:bg-sidebar-accent/60"
                        render={
                          <Link
                            to={item.to}
                            onClick={onNavigate}
                            aria-current={isActive ? "page" : undefined}
                          />
                        }
                      >
                        <span>{item.label}</span>
                        {badge && (
                          <SidebarMenuBadge className="static ml-auto rounded-full bg-error px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
                            {badge}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* 하단 유틸 — 내 정보 수정 */}
      <SidebarFooter className="px-2.5 pb-8">
        <Link
          to={GOAL_NAV_FOOTER.to}
          onClick={onNavigate}
          className="block px-3 py-2 text-[0.8125rem] leading-[1.4] text-ink-sub hover:text-ink-strong"
        >
          {GOAL_NAV_FOOTER.label}
        </Link>
      </SidebarFooter>
    </>
  );
}
