import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { GOAL_NAV_GROUPS, GOAL_NAV_FOOTER } from './goalNavItems';
import { mockStudent, mockSchedules } from '../../data/goalMock';
import { fetchGoalTimer } from '../../lib/goalApi';

// "진행중" 뱃지 폴링 간격 — Timer.jsx 본문 폴링(20초)보다 느슨하게 둔다. 사이드바는
// GoalAppLayout에 상주해 어느 목표관리 화면에 있어도 계속 폴링되므로 과한 빈도는 낭비다.
const TIMER_BADGE_POLL_MS = 45 * 1000;

// 사이드바 뱃지 소스. scheduleCount·dailyRecordDone은 아직 목업 단계 고정값(실데이터 연동
// 대상 — 각각 중요일정·오늘의 기록 작업 범위). timerRunning만 이번 작업(단계 B)에서
// 실데이터로 교체한다 — 기존 데이터 흐름에 새 상태·store를 얹지 않고, StudyPlanRail(학습
// 계획 레일)이 자체적으로 자기 데이터를 조회하는 것과 같은 방식으로 사이드바가 직접
// GET /api/goal/timer를 폴링해 running 필드만 뽑아 쓴다(판단 지점 — 전역 상태 관리 도입은
// 이 저장소에 선례가 없어 최소 변경 쪽을 택했다).
export default function GoalSidebar() {
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const result = await fetchGoalTimer();
      if (!cancelled && result.kind === 'success') {
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

  const navBadgeData = {
    scheduleCount: mockSchedules.length,
    dailyRecordDone: false,
    timerRunning
  };

  // 목표관리 앱 좌측 고정 사이드바 — docs/figma-goal/00-INDEX.md §5-2 `GoalSidebar`.
  // 실측 규격: 폭 324px(20.25rem), min-height 100vh(시안 rect 높이 2121/2325/3169는 프레임 초과값이라 무시).
  // 시안 절대좌표(사용자 블록 x=60/y=100·130, 내비 시작 y=271, 그룹 pitch 207, 항목 pitch 42, 활성
  // pill 304×36 x=10)는 초기 배치 근거로만 쓰고, 실제 구현은 flex column + gap으로 반응형 여지를 둔다.
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
                      end={item.to === '/app/goal'}
                      className={({ isActive }) =>
                        [
                          'mx-[0.625rem] flex h-[2.25rem] items-center justify-between rounded-lg pl-[3.125rem] pr-4 text-[0.875rem] leading-[1.4] transition-colors',
                          isActive
                            ? 'bg-goal-activePill font-semibold text-ink-strong'
                            : 'text-ink hover:bg-goal-activePill/60'
                        ].join(' ')
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
