import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { mockStudent } from "../../data/goalMock";
import { kstYMD } from "../../lib/goal/calc/index.ts";
import { fetchGoalSchedules, fetchGoalTimer } from "../../lib/goalApi";
import { GOAL_NAV_FOOTER, GOAL_NAV_GROUPS } from "./goalNavItems";

// "진행중" 뱃지 폴링 간격 — Timer.jsx 본문 폴링(20초)보다 느슨하게 둔다. 사이드바는
// GoalAppLayout에 상주해 어느 목표관리 화면에 있어도 계속 폴링되므로 과한 빈도는 낭비다.
const TIMER_BADGE_POLL_MS = 45 * 1000;

// 사이드바 뱃지 소스 — 중요일정 카운트(GET /api/goal/schedules, due_date 오늘 이후 행 수)와
// 타이머 진행 여부(GET /api/goal/timer 45초 폴링)를 실데이터로 쓴다. dailyRecordDone은
// 별도 UoW 소관이라 목업 고정값 유지. GoalAppLayout이 props 없이 셸로 마운트하므로
// 이 컴포넌트가 직접 조회한다(StudyPlanRail 자체 조회 선례, 전역 상태 도입 없음).
export default function GoalSidebar() {
  const [timerRunning, setTimerRunning] = useState(false);
  const [scheduleCount, setScheduleCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const result = await fetchGoalTimer();
      if (!cancelled && result.kind === "success") {
        setTimerRunning(Boolean(result.summary?.running));
      }
    };

    poll();
    const intervalId = setInterval(poll, TIMER_BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    fetchGoalSchedules().then((result) => {
      if (!alive || result.kind !== "success") return;
      const today = kstYMD(new Date());
      const upcoming = result.schedules.filter(
        (schedule) => schedule.dueDate >= today,
      );
      setScheduleCount(upcoming.length);
    });

    return () => {
      alive = false;
    };
  }, []);

  const navBadgeData = { scheduleCount, dailyRecordDone: false, timerRunning };

  return (
    <aside className="flex min-h-screen w-[20.25rem] flex-shrink-0 flex-col bg-goal-sidebar">
      {/* 사용자 블록 — x=60(3.75rem) / y=100(6.25rem) 이름, y=130 학년·학교유형 */}
      <div className="px-[3.75rem] pt-[6.25rem]">
        <p className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
          {mockStudent.name}의 목표관리
        </p>
        <p className="mt-[0.5rem] text-[0.875rem] leading-[1.4] text-ink-sub">
          {mockStudent.grade}・{mockStudent.schoolType}
        </p>
      </div>

      {/* 내비 4그룹 10항목 — 시안 내비 시작 y=271(사용자 블록과 120px 간격)을 근사한 여백 */}
      <nav className="mt-[7.5rem] flex flex-col gap-10">
        {GOAL_NAV_GROUPS.map(({ group, items }) => (
          <div key={group}>
            <p className="px-[3.75rem] pb-3 text-[0.8125rem] font-medium leading-[1.4] text-ink-sub">
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
                      className={({ isActive }) =>
                        [
                          "mx-[0.625rem] flex h-[2.25rem] items-center justify-between rounded-lg pl-[3.125rem] pr-4 text-[0.875rem] leading-[1.4] transition-colors",
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
      <div className="mt-auto px-[0.625rem] pb-[2rem] pt-[2rem]">
        <NavLink
          to={GOAL_NAV_FOOTER.to}
          className="block pl-[3.125rem] text-[0.8125rem] leading-[1.4] text-ink-sub hover:text-ink-strong"
        >
          {GOAL_NAV_FOOTER.label}
        </NavLink>
      </div>
    </aside>
  );
}
