import { useEffect, useState } from 'react';
import GoalPageHeader from '../../components/goal/GoalPageHeader';
import SubjectTimerCard from '../../components/goal/study/SubjectTimerCard';
import TimerSummaryBar from '../../components/goal/study/TimerSummaryBar';
import SessionRecordPanel from '../../components/goal/study/SessionRecordPanel';
import { mockSubjectTimers } from '../../data/goalStudyMock';

// TODO(정합성): 실제 제품은 서버 시각 기준 누적(경과 = now − startedAt + accumulated)으로 계산해야
// 새로고침·탭 이탈에 안전하다(part-09 §140 구현 노트 "화면 값만 보면 클라이언트 setInterval처럼
// 보이지만 시안에 근거 없음"). 이 화면은 목업 범위라 로컬 상태 + setInterval로 단순 카운트한다.
// 실데이터 연동 시 반드시 서버 시각 기준 계산으로 교체할 것.

// 열공 타이머(#25) — 4과목 스톱워치 2×2(420×241) + 전체 합계 바(860×100) + 오늘 세션 기록
// 패널(420×382). part-09 §45~144.
export default function Timer() {
  const [subjects, setSubjects] = useState(mockSubjectTimers);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setSubjects((prev) =>
        prev.map((subject) => (subject.running ? { ...subject, elapsedSeconds: subject.elapsedSeconds + 1 } : subject))
      );
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // 배타 실행: `시작`을 누른 과목만 running=true, 나머지는 자동 일시정지된다
  // (part-09 §133 "한 번에 한 과목만 측정돼요. 다른 과목을 시작하면 이전 과목은 자동으로 멈춥니다.").
  const handleToggle = (id) => {
    setSubjects((prev) =>
      prev.map((subject) =>
        subject.id === id ? { ...subject, running: !subject.running } : { ...subject, running: false }
      )
    );
  };

  const handleReset = (id) => {
    setSubjects((prev) =>
      prev.map((subject) => (subject.id === id ? { ...subject, elapsedSeconds: 0, running: false } : subject))
    );
  };

  const totalSeconds = subjects.reduce((sum, subject) => sum + subject.elapsedSeconds, 0);

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
        {/* 카드 그리드(860px) + 우측 세션 패널(420px=26.25rem) — part-09 §54~63. 고정 rem 컬럼은
            반응형 범위 밖이지만(작업 지시 확정 사항 §6) grid/flex 기반이라 추후 브레이크포인트를
            얹기 쉽다. */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_26.25rem]">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {subjects.map((subject) => (
                <SubjectTimerCard
                  key={subject.id}
                  label={subject.label}
                  colorKey={subject.id}
                  targetHours={subject.targetHours}
                  elapsedSeconds={subject.elapsedSeconds}
                  running={subject.running}
                  onToggle={() => handleToggle(subject.id)}
                  onReset={() => handleReset(subject.id)}
                />
              ))}
            </div>
            <TimerSummaryBar totalSeconds={totalSeconds} />
          </div>
          <SessionRecordPanel subjects={subjects} />
        </div>
      </div>
    </>
  );
}
