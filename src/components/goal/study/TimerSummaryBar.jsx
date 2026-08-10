import { Link } from 'react-router-dom';
import GoalCard from '../GoalCard';
import { formatClock } from './SubjectTimerCard';

// 전체 합계 바(#25, 860×100) — 4과목 elapsedSeconds 합계. part-09 §135 "합계 반영: 클라이언트 계산".
// CTA `전체 종료 후 기록` → #26 오늘의 공부 기록으로 이동(part-09 §136 "종료 시 오늘의 공부 기록과
// 순공 시간에 자동 반영" 카피 근거). 실제 반영 로직은 이번 범위 밖(스텁 네비게이션만).
export default function TimerSummaryBar({ totalSeconds }) {
  return (
    <GoalCard tone="neutral" className="flex flex-wrap items-center justify-between gap-4 px-[2rem] py-[1.5rem]">
      <div className="flex items-baseline gap-3">
        <span className="text-[1rem] font-semibold leading-[1.4] text-ink-strong">전체 합계</span>
        <span className="text-[1.5rem] font-bold leading-[1.2] tabular-nums text-ink-strong">
          {formatClock(totalSeconds)}
        </span>
      </div>
      <Link
        to="/goal/daily-record"
        className="flex h-[2.4375rem] shrink-0 items-center justify-center rounded-full bg-ink-strong px-6 text-[0.9375rem] font-semibold leading-[1.2] text-white"
      >
        전체 종료 후 기록
      </Link>
    </GoalCard>
  );
}
