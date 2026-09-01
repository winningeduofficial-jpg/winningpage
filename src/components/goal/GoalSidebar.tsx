import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";
import { useAuth } from "@/context/AuthProvider";
import { kstYMD } from "@/lib/goal/calc/index.js";
import {
  fetchGoalSchedules,
  fetchGoalTimer,
  heartbeatGoalTimer,
} from "@/lib/goalApi";
import { goalStudentQueryOptions } from "@/lib/queryClient";
import { GOAL_NAV_FOOTER, GOAL_NAV_GROUPS } from "./goalNavItems";

// "진행중" 뱃지 폴링 간격 — Timer.jsx 본문 폴링(20초)보다 느슨하게 둔다. 사이드바는
// GoalAppLayout에 상주해 어느 목표관리 화면에 있어도 계속 폴링되므로 과한 빈도는 낭비다.
const TIMER_BADGE_POLL_MS = 45 * 1000;

// 하트비트 간격 — 예전 Timer.jsx 로컬 상수와 같은 값(60초)을 그대로 옮겼다.
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

// 사이드바 뱃지 소스 — 중요일정 카운트(GET /api/goal/schedules, due_date 오늘 이후 행 수)와
// 타이머 진행 여부(GET /api/goal/timer 45초 폴링)를 실데이터로 쓴다. dailyRecordDone은
// 별도 UoW 소관이라 목업 고정값 유지. GoalAppLayout이 props 없이 셸로 마운트하므로
// 이 컴포넌트가 직접 조회한다(StudyPlanRail 자체 조회 선례, 전역 상태 도입 없음).
export default function GoalSidebar() {
  const [timerRunning, setTimerRunning] = useState(false);
  // 하트비트 effect가 setInterval 콜백 안에서 읽을 최신값 — effect 자체는 마운트 시
  // 한 번만 등록하고(빈 의존성 배열) 매 폴링마다 재구독하지 않으므로 state 클로저가
  // 아니라 ref로 최신 실행 여부를 넘긴다.
  const timerRunningRef = useRef(false);
  const [scheduleCount, setScheduleCount] = useState(0);
  // ['goal','student', userId] 쿼리 캐시(src/lib/queryClient.ts)를 그대로 구독한다 —
  // 목표관리 진입 시 미들웨어·Dashboard.tsx가 이미 채워둔 캐시를 재사용해 사이드바
  // 전용 재요청을 없앤다(명세 B-3 §5). 캐시 키의 userId는 리뷰 C1(계정 전환 캐시
  // 오염 방지). data가 없거나 kind가 'onboarded'가 아니면(방어적 분기, Dashboard.jsx와
  // 동일 사유) "나의 목표관리" 폴백 문구만 보여준다.
  const { userId } = useAuth();
  const { data: goalStudentResult } = useQuery(goalStudentQueryOptions(userId));
  const profile =
    goalStudentResult?.kind === "onboarded"
      ? goalStudentResult.student.profile
      : null;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const result = await fetchGoalTimer();
      if (!cancelled && result.kind === "success") {
        const running = Boolean(result.summary?.running);
        timerRunningRef.current = running;
        setTimerRunning(running);
      }
    };

    poll();
    const intervalId = setInterval(poll, TIMER_BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  // 열공 타이머 하트비트(QA 행286 "이탈 시 자동 마감" 수정) — 예전엔 Timer.jsx가 자신이
  // 마운트돼 있을 때만 하트비트를 보내, 타이머를 켠 채 다른 메뉴로 이동하면 하트비트가
  // 끊겨 서버 TIMER_STALE_MS(5분) 무하트비트 타임아웃으로 세션이 강제 마감됐다. 이 사이드바는
  // GoalAppLayout에 상주해 목표관리 앱 안 어느 화면에 있어도 마운트가 유지되므로, 여기서
  // 실행 중 세션이 있을 때만(timerRunningRef, 위 폴링이 45초마다 갱신) 하트비트를 보낸다 —
  // Timer.jsx는 더 이상 자체 하트비트를 보내지 않는다(이중 전송 방지). 탭을 완전히 닫으면
  // pagehide가 마지막으로 한 번 더 보내고, 그 이후는 서버 스테일 마감이 그대로 안전장치로
  // 남는다(의도된 동작, 유지).
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (timerRunningRef.current) heartbeatGoalTimer();
    }, HEARTBEAT_INTERVAL_MS);
    const onPageHide = () => {
      if (timerRunningRef.current) heartbeatGoalTimer({ keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("pagehide", onPageHide);
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
