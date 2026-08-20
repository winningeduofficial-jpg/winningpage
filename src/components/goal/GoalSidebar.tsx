import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { kstYMD } from "@/lib/goal/calc/index.js";
import {
  fetchGoalSchedules,
  fetchGoalStudent,
  fetchGoalTimer,
} from "@/lib/goalApi";
import { GOAL_NAV_FOOTER, GOAL_NAV_GROUPS } from "./goalNavItems";

type SidebarProfile = { name: string | null; grade: string; schoolType: string };

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
  // null = 로딩 중(사용자 블록 이름·학년 줄 비움). fetchGoalStudent()가 실패하거나
  // kind가 'onboarded'가 아니면(방어적 분기, Dashboard.jsx와 동일 사유) 로딩 상태로
  // 남겨 "나의 목표관리" 폴백 문구만 보여준다.
  const [profile, setProfile] = useState<SidebarProfile | null>(null);

  useEffect(() => {
    let alive = true;
    fetchGoalStudent().then((result) => {
      if (!alive || result.kind !== "onboarded") return;
      const { name, grade, schoolType } = result.student.profile;
      setProfile({ name, grade, schoolType });
    });
    return () => {
      alive = false;
    };
  }, []);

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
    <aside className="flex min-h-screen w-perf-sidebar shrink-0 flex-col bg-goal-sidebar">
      {/* 사용자 블록 — x=60(3.75rem) / y=100(6.25rem) 이름, y=130 학년·학교유형.
          로딩 중·이름 없음은 "나의 목표관리"로 폴백한다. 학년·학교유형 줄은 값이
          있을 때만 채우고, 로딩 중엔 레이아웃이 흔들리지 않도록 p 태그는 유지한 채
          내용만 비운다. */}
      <div className="px-perf-inset pt-25">
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
          className="block pl-12.5 text-[0.8125rem] leading-[1.4] text-ink-sub hover:text-ink-strong"
        >
          {GOAL_NAV_FOOTER.label}
        </NavLink>
      </div>
    </aside>
  );
}
