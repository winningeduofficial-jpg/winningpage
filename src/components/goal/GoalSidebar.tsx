import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/AuthProvider";
import { kstYMD } from "@/lib/goal/calc/index.js";
import type { FetchTodayGoalRecordResult } from "@/lib/goalApi";
import {
  fetchGoalSchedules,
  fetchGoalTimer,
  heartbeatGoalTimer,
} from "@/lib/goalApi";
import {
  goalDailyRecordQueryOptions,
  goalStudentQueryOptions,
} from "@/lib/queryClient";
import GoalSidebarContent from "./GoalSidebarContent";
import { GOAL_NAV_GROUPS, GOAL_NAV_HEADER } from "./goalNavItems";

// "진행중" 뱃지 폴링 간격 — Timer.jsx 본문 폴링(20초)보다 느슨하게 둔다. 사이드바는
// GoalAppLayout에 상주해 어느 목표관리 화면에 있어도 계속 폴링되므로 과한 빈도는 낭비다.
const TIMER_BADGE_POLL_MS = 45 * 1000;

// 하트비트 간격 — 예전 Timer.jsx 로컬 상수와 같은 값(60초)을 그대로 옮겼다.
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/**
 * QA3 행305 후속 — "오늘의 공부 기록" 미기록 뱃지 판정. 순수 함수로 분리해
 * 단독 테스트한다(Dashboard.tsx buildTodayHeadline과 동일 관례). record.recordIndex가
 * null이 아니면(실제 daily_records 행 존재 — 타이머 시간만으로 합성된 프리필은
 * recordIndex:null이라 여기 해당 없다, api/goal/daily-record.ts mergeTimerIntoRecord
 * 계약) 오늘 이미 기록을 남긴 것이다. cooldown.active도 같은 결론(제출하지 않으면
 * 잠금 자체가 없다) — 자정을 갓 넘겨 오늘 행은 아직 없지만 어제 밤 제출로 잠금만
 * 남아 있는 경우까지 "기록함"으로 잡는다.
 */
export function deriveDailyRecordDone(
  result: FetchTodayGoalRecordResult | undefined,
): boolean {
  if (!result || result.kind !== "success") return false;
  return Boolean(result.record?.recordIndex != null || result.cooldown?.active);
}

// 사이드바 뱃지 소스 — 중요일정 카운트(GET /api/goal/schedules, due_date 오늘 이후 행 수)와
// 타이머 진행 여부(GET /api/goal/timer 45초 폴링), 오늘의 공부 기록 제출 여부
// (dailyRecordDone, QA3 행305 후속 — goalDailyRecordQueryOptions 공유 캐시)를
// 실데이터로 쓴다. GoalAppLayout이 props 없이 셸로 마운트하므로 이 컴포넌트가
// 직접 조회한다(StudyPlanRail 자체 조회 선례, 전역 상태 도입 없음).
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

  // QA3 행305 후속 — "오늘의 공부 기록" 미기록 뱃지(판정 로직은 deriveDailyRecordDone).
  const { data: dailyRecordResult } = useQuery(
    goalDailyRecordQueryOptions(userId),
  );
  const dailyRecordDone = deriveDailyRecordDone(dailyRecordResult);

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

  const navBadgeData = { scheduleCount, dailyRecordDone, timerRunning };

  // 모바일(< md) 앱바 타이틀 — 현재 경로가 속한 내비 항목 라벨, 없으면 "목표관리" 폴백.
  // GOAL_NAV_HEADER("메인으로", to="/")는 모든 goal 경로의 접두어라 매칭 대상에서 뺀다.
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const currentNavLabel = useMemo(() => {
    // 그룹마다 getBadge 시그니처가 달라(union 타입) flatMap 결과 타입이 서로 안 맞으므로
    // 매칭에 필요한 to/label만 뽑아 공통 shape으로 평탄화한다.
    const items: { to: string; label: string }[] = GOAL_NAV_GROUPS.flatMap(
      (g) => g.items.map((item) => ({ to: item.to, label: item.label })),
    );
    const match = items.find((item) =>
      item.to === "/app/goal"
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(`${item.to}/`),
    );
    return match?.label ?? "목표관리";
  }, [pathname]);

  // 드로어가 열려 있는 동안 body 스크롤 잠금 — Base UI Dialog가 배경 스크롤은 이미
  // 막아주지만(내부 scroll-lock), 이 프로젝트의 다른 모바일 드로어(Header.tsx)도 별도
  // 잠금을 두지 않고 Dialog 기본 동작에 맡기는 선례를 따른다. ESC 닫기·포커스 트랩·
  // 배경 스크롤 잠금·닫힐 때 포커스 복귀(finalFocus)는 전부 Dialog(Base UI) 내장 동작.
  return (
    <>
      {/* 모바일(< md) 상단 앱바 — 고정 사이드바 대신 햄버거로 드로어를 연다. */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-goal-activePill bg-goal-sidebar px-4 md:hidden">
        <button
          ref={hamburgerRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="메뉴 열기"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-lg text-ink-strong transition-colors hover:bg-goal-activePill/60"
        >
          <Menu size={20} />
        </button>
        <p className="text-[0.9375rem] font-semibold leading-[1.4] text-ink-strong">
          {currentNavLabel}
        </p>
        <NavLink
          to={GOAL_NAV_HEADER.to}
          className="-mr-1 text-[0.8125rem] leading-[1.4] text-ink-sub hover:text-ink-strong"
        >
          {GOAL_NAV_HEADER.label}
        </NavLink>
      </header>

      {/* 모바일 드로어 — 데스크톱 aside와 같은 GoalSidebarContent를 재사용한다. */}
      <Dialog
        open={drawerOpen}
        onOpenChange={(next) => {
          if (!next) setDrawerOpen(false);
        }}
      >
        <DialogPortal>
          <DialogOverlay className="bg-black/40 md:hidden" />
          <DialogPrimitive.Popup
            id="goal-mobile-nav-drawer"
            finalFocus={hamburgerRef}
            aria-modal="true"
            aria-label="목표관리 메뉴"
            className="fixed inset-y-0 left-0 z-60 flex h-full w-[85vw] max-w-perf-sidebar flex-col bg-goal-sidebar shadow-[18px_0_45px_rgba(13,27,42,0.14)] outline-none transition-transform duration-300 ease-(--ease-out-quart) motion-reduce:transition-none motion-reduce:duration-0 data-closed:-translate-x-full data-open:translate-x-0 md:hidden"
          >
            <ScrollArea className="flex-1">
              <div className="flex justify-end px-2.5 pt-4">
                <DialogClose
                  aria-label="메뉴 닫기"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-sub transition-colors hover:bg-goal-activePill/60"
                >
                  <X size={20} />
                </DialogClose>
              </div>
              <GoalSidebarContent
                profile={profile}
                navBadgeData={navBadgeData}
                onNavigate={() => setDrawerOpen(false)}
              />
            </ScrollArea>
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>

      {/* 데스크톱(>= md) 고정 사이드바 — 모바일에서는 렌더 트리에서 완전히 빠진다
          (hidden 대신 md 분기 자체를 hidden md:flex로 걸어, 앱바/드로어와 동시에
          DOM에 존재하되 시각적으로만 숨는다 — 데이터 조회는 이 컴포넌트 하나가
          전담하므로 이중 폴링 걱정 없이 aside 쪽만 조건부로 숨겨도 안전하다). */}
      <aside className="hidden min-h-screen w-perf-sidebar shrink-0 flex-col bg-goal-sidebar md:flex">
        <GoalSidebarContent profile={profile} navBadgeData={navBadgeData} />
      </aside>
    </>
  );
}
