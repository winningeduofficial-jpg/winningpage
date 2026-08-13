import { useCallback, useEffect, useRef, useState } from 'react';
import GoalPageHeader from '../../components/goal/GoalPageHeader';
import SubjectTimerCard from '../../components/goal/study/SubjectTimerCard';
import TimerSummaryBar from '../../components/goal/study/TimerSummaryBar';
import SessionRecordPanel from '../../components/goal/study/SessionRecordPanel';
import { TIMER_SUBJECT_ORDER } from '../../data/goalStudyMock';
import { getSubjectLabel } from '../../components/goal/subjectTokens';
import { fetchGoalStudent, fetchGoalTimer, heartbeatGoalTimer, setGoalTimerTarget, startGoalTimer, stopGoalTimer } from '../../lib/goalApi';
import { VIRTUAL_DAY_NAMES, getDayIndexFromYMDServer, kstYMD } from '../../lib/goal/calc/index.js';

const POLL_INTERVAL_MS = 20 * 1000; // GET 폴링 15~30초 범위(임무 지시)
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

// 열공 타이머(#25) 4과목 스톱워치 2×2(420×241) + 전체 합계 바(860×100) + 오늘 세션 기록
// 패널(420×382). part-09 §45~144.
//
// 서버 시각이 유일 진실이다(임무 지시 확정 사항) — 이 컴포넌트는 GET /api/goal/timer가
// 준 진행 중 세션의 startedAt과 "추정 서버 현재 시각"(clockOffsetMs, 마지막 GET 응답의
// serverNow − Date.now())으로 매초 표시값만 다시 계산한다. 저장은 하지 않는다 —
// setInterval이 하는 일은 화면 갱신 트리거(tick)뿐이고, 실제 누적은 항상 서버 재조회로
// 확정된다(폴링·visibilitychange·start/stop 직후 reload).
export default function Timer() {
  const [summary, setSummary] = useState(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [defaultTargetHours, setDefaultTargetHours] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [, setTick] = useState(0);
  const pendingRef = useRef(false);

  const applySummary = useCallback((body) => {
    const subjectSeconds = {};
    for (const row of body.subjects || []) subjectSeconds[row.subject] = row.seconds;
    const subjectTargets = {};
    for (const row of body.targets || []) subjectTargets[row.subject] = row.targetHours;

    setSummary({
      date: body.date,
      running: body.running || null,
      subjectSeconds,
      subjectTargets,
      totalSeconds: body.totalSeconds ?? 0
    });
    setClockOffsetMs(new Date(body.serverNow).getTime() - Date.now());
    setLoadError(false);
  }, []);

  const reload = useCallback(async () => {
    const result = await fetchGoalTimer();
    if (result.kind === 'success') {
      applySummary(result.summary);
    } else if (result.kind !== 'no-session' && result.kind !== 'not-allowed') {
      setLoadError(true);
    }
  }, [applySummary]);

  // 최초 로드 + 오늘 요일 이상 목표 총합(과목별 목표 기본값 산출용, 저장하지 않는 파생값).
  useEffect(() => {
    reload();

    fetchGoalStudent().then((result) => {
      if (result.kind !== 'onboarded') return;
      const weeklySchedule = result.student?.weeklySchedule || {};
      const dayName = VIRTUAL_DAY_NAMES[getDayIndexFromYMDServer(kstYMD(new Date()))];
      const idealToday = weeklySchedule?.[dayName]?.ideal;
      setDefaultTargetHours(typeof idealToday === 'number' ? idealToday / TIMER_SUBJECT_ORDER.length : null);
    });
  }, [reload]);

  // GET 폴링(15~30초) + 탭 복귀 시 refetch.
  useEffect(() => {
    const intervalId = setInterval(reload, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  // 표시용 1초 틱 — 서버 재조회 없이 진행 중 카드의 경과 표시만 갱신한다.
  useEffect(() => {
    const intervalId = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(intervalId);
  }, []);

  // 하트비트 60초 간격 + pagehide(fetch keepalive — sendBeacon 대신 쓰는 이유는
  // src/lib/goalApi.js 주석 참고, Authorization 헤더가 필요해 sendBeacon은 못 쓴다).
  useEffect(() => {
    const intervalId = setInterval(() => {
      heartbeatGoalTimer();
    }, HEARTBEAT_INTERVAL_MS);
    const onPageHide = () => {
      heartbeatGoalTimer({ keepalive: true });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  const estimatedNowMs = Date.now() + clockOffsetMs;
  const runningSubject = summary?.running?.subject ?? null;
  const runningStartedAtMs = summary?.running?.startedAt ? new Date(summary.running.startedAt).getTime() : null;
  const liveElapsedSeconds =
    runningStartedAtMs != null ? Math.max(0, Math.floor((estimatedNowMs - runningStartedAtMs) / 1000)) : 0;

  // 배타 실행: 진행 중인 카드를 다시 누르면 종료, 그 외 카드를 누르면 서버가 자동으로
  // 이전 과목을 전환 마감한다(part-09 §133 "다른 과목을 시작하면 이전 과목은 자동으로 멈춥니다").
  const handleToggle = async (subjectId) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      if (runningSubject === subjectId) {
        await stopGoalTimer();
      } else {
        await startGoalTimer(subjectId);
      }
      await reload();
    } finally {
      pendingRef.current = false;
    }
  };

  const handleTargetChange = async (subjectId, hours) => {
    const result = await setGoalTimerTarget(subjectId, hours);
    if (result.kind === 'success') {
      setSummary((prev) =>
        prev ? { ...prev, subjectTargets: { ...prev.subjectTargets, [subjectId]: hours } } : prev
      );
    }
  };

  const cards = TIMER_SUBJECT_ORDER.map((id) => {
    const accumulatedSeconds = summary?.subjectSeconds?.[id] ?? 0;
    const running = runningSubject === id;
    const hasCustomTarget = summary?.subjectTargets?.[id] != null;
    const targetHours = hasCustomTarget ? summary.subjectTargets[id] : defaultTargetHours ?? 0;

    return {
      id,
      label: getSubjectLabel(id),
      targetHours,
      isDefaultTarget: !hasCustomTarget,
      elapsedSeconds: running ? accumulatedSeconds + liveElapsedSeconds : accumulatedSeconds,
      running
    };
  });

  const totalSeconds = (summary?.totalSeconds ?? 0) + liveElapsedSeconds;

  return (
    <>
      <GoalPageHeader
        title="열공 타이머"
        subcopy="측정한 시간은 종료 시 오늘의 공부 기록과 순공 시간에 자동 반영됩니다."
      />
      <div className="max-w-goal-content px-[3rem] pb-24">
        <p className="mb-6 text-[0.9375rem] leading-[1.4] text-ink-sub">
          한 번에 한 과목만 측정돼요. 다른 과목을 시작하면 이전 과목은 자동으로 멈춥니다.
        </p>
        {loadError && (
          <p className="mb-6 text-[0.875rem] leading-[1.4] text-error">
            타이머 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        {/* 카드 그리드(860px) + 우측 세션 패널(420px=26.25rem) — part-09 §54~63. 고정 rem 컬럼은
            반응형 범위 밖이지만(작업 지시 확정 사항 §6) grid/flex 기반이라 추후 브레이크포인트를
            얹기 쉽다. */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_26.25rem]">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {cards.map((subject) => (
                <SubjectTimerCard
                  key={subject.id}
                  label={subject.label}
                  colorKey={subject.id}
                  targetHours={subject.targetHours}
                  isDefaultTarget={subject.isDefaultTarget}
                  elapsedSeconds={subject.elapsedSeconds}
                  running={subject.running}
                  onToggle={() => handleToggle(subject.id)}
                  onTargetChange={(hours) => handleTargetChange(subject.id, hours)}
                />
              ))}
            </div>
            <TimerSummaryBar totalSeconds={totalSeconds} />
          </div>
          <SessionRecordPanel subjects={cards} />
        </div>
      </div>
    </>
  );
}
