import { NavLink } from "react-router";
import type { GoalStudentPayload } from "@/lib/goalApi";
import {
  GOAL_NAV_FOOTER,
  GOAL_NAV_GROUPS,
  GOAL_NAV_HEADER,
} from "./goalNavItems";

type GoalSidebarContentProps = {
  profile: GoalStudentPayload["profile"] | null;
  navBadgeData: {
    scheduleCount: number;
    dailyRecordDone: boolean;
    timerRunning: boolean;
  };
  // 모바일 드로어에서 링크 클릭 시 드로어를 닫는 콜백 — 데스크톱 aside는 넘기지 않는다
  // (닫을 드로어가 없으므로 no-op).
  onNavigate?: () => void;
};

// GoalSidebar의 마크업 내용부만 분리한 순수 표시 컴포넌트 — 데스크톱 aside와 모바일
// 드로어가 이 컴포넌트를 그대로 재사용해 내비 마크업이 두 곳에 중복되지 않는다.
// 데이터 조회·폴링(프로필 쿼리·타이머·하트비트·중요일정 카운트)은 여전히 GoalSidebar가
// 전담한다 — 이 컴포넌트가 직접 조회하면 데스크톱/모바일 두 인스턴스가 동시에 마운트될
// 때(반응형은 CSS만으로 전환하므로 DOM엔 둘 다 있을 수 있다) 폴링·하트비트가 이중으로
// 나간다.
export default function GoalSidebarContent({
  profile,
  navBadgeData,
  onNavigate,
}: GoalSidebarContentProps) {
  return (
    <div className="flex min-h-full w-full flex-col">
      {/* QA 행318 — 상단 "메인으로" 링크. 사이드바 최상단에 두어 목표관리 앱 어느
          화면에서도 사이트 메인으로 바로 나갈 수 있게 한다(하단 "내 정보 수정"과
          같은 순수 이동, 이탈 확인 없음). */}
      <div className="px-perf-inset pt-6">
        <NavLink
          to={GOAL_NAV_HEADER.to}
          onClick={onNavigate}
          className="text-[0.8125rem] leading-[1.4] text-ink-sub hover:text-ink-strong"
        >
          {GOAL_NAV_HEADER.label}
        </NavLink>
      </div>

      {/* 사용자 블록 — x=60(3.75rem) / y=100(6.25rem) 이름, y=130 학년·학교유형.
          로딩 중·이름 없음은 "나의 목표관리"로 폴백한다. 학년·학교유형 줄은 값이
          있을 때만 채우고, 로딩 중엔 레이아웃이 흔들리지 않도록 p 태그는 유지한 채
          내용만 비운다. */}
      <div className="px-perf-inset pt-6">
        <p className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
          {profile?.name ? `${profile.name}의 목표관리` : "나의 목표관리"}
        </p>
        <p className="mt-2 text-[0.875rem] leading-[1.4] text-ink-sub">
          {profile ? `${profile.grade}・${profile.schoolType}` : ""}
        </p>
      </div>

      {/* 내비 4그룹 10항목 — 시안 내비 시작 y=271(사용자 블록과 120px 간격)을 근사한 여백 */}
      <nav className="mt-30 flex flex-col gap-10">
        {GOAL_NAV_GROUPS.map(({ group, items }) => (
          <div key={group}>
            <p className="px-perf-inset pb-3 text-[0.8125rem] font-medium leading-[1.4] text-ink-sub">
              {group}
            </p>
            <ul className="flex flex-col gap-1">
              {items.map((item) => {
                const badge = item.getBadge?.(navBadgeData);
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/app/goal"}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        [
                          "mx-2.5 flex h-9 items-center justify-between rounded-lg pl-12.5 pr-4 text-[0.875rem] leading-[1.4] transition-colors",
                          isActive
                            ? "bg-goal-activePill font-semibold text-ink-strong"
                            : "text-ink hover:bg-goal-activePill/60",
                        ].join(" ")
                      }
                    >
                      <span>{item.label}</span>
                      {badge && (
                        <span className="ml-2 rounded-full bg-error px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 하단 유틸 — 내 정보 수정 */}
      <div className="mt-auto px-2.5 pb-8 pt-8">
        <NavLink
          to={GOAL_NAV_FOOTER.to}
          onClick={onNavigate}
          className="block pl-12.5 text-[0.8125rem] leading-[1.4] text-ink-sub hover:text-ink-strong"
        >
          {GOAL_NAV_FOOTER.label}
        </NavLink>
      </div>
    </div>
  );
}
