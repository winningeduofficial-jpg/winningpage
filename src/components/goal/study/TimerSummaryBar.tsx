import { useState } from "react";
import { useNavigate } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import { stopGoalTimer } from "@/lib/goalApi";
import { formatClock } from "./SubjectTimerCard";

// 전체 합계 바(#25, 860×100) — 4과목 elapsedSeconds 합계. part-09 §135 "합계 반영: 클라이언트 계산".
// CTA `전체 종료 후 기록` → 진행 중인 세션이 있으면 서버에 stop을 보내 마감한 뒤(#26 오늘의 공부
// 기록에 "종료 시 자동 반영"이라는 카피 근거, part-09 §136) 오늘의 공부 기록으로 이동한다.
type TimerSummaryBarProps = {
  totalSeconds: number;
};

export default function TimerSummaryBar({
  totalSeconds,
}: TimerSummaryBarProps) {
  const navigate = useNavigate();
  const [finishing, setFinishing] = useState(false);

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await stopGoalTimer();
    } finally {
      navigate("/app/goal/daily-record");
    }
  };

  return (
    <GoalCard
      tone="neutral"
      className="flex flex-wrap items-center justify-between gap-4 px-8 py-6"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-[1rem] font-semibold leading-[1.4] text-ink-strong">
          전체 합계
        </span>
        <span className="text-[1.5rem] font-bold leading-[1.2] tabular-nums text-ink-strong">
          {formatClock(totalSeconds)}
        </span>
      </div>
      <button
        type="button"
        onClick={handleFinish}
        disabled={finishing}
        className="flex h-9.75 shrink-0 items-center justify-center rounded-full bg-ink-strong px-6 text-[0.9375rem] font-semibold leading-[1.2] text-white disabled:opacity-60"
      >
        전체 종료 후 기록
      </button>
    </GoalCard>
  );
}
