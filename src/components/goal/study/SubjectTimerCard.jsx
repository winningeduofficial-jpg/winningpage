import { RotateCcw } from 'lucide-react';
import GoalProgressBar from '../GoalProgressBar';
import { getSubjectStrongClass } from '../subjectTokens';

function pad(n) {
  return String(n).padStart(2, '0');
}

// HH:MM:SS 표기 — part-09 §120~123 (`00:50:12` 등). 초 단위 경과값을 그대로 조판한다.
export function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// 열공 타이머(#25) 과목 카드(420×241 = 26.25rem×15.0625rem). part-09 §66~76 내부 스펙,
// §132~134 상태/인터랙션(진행 중=진한 숫자+`일시정지`, 그 외=옅은 숫자+`시작`).
//
// 진행바 채움은 반드시 elapsed/target 비례로 계산한다 — 시안은 4카드 모두 83/340(24.4%)로
// 목표·경과가 다 다른데도 동일해 "시안 미갱신"으로 판단했다(part-09 §78, 작업 지시 확정 사항 §2).
//
// 리셋 버튼은 경과 0이면 비활성 처리한다(part-09 §134 "비활성 확정 근거 없음(추정: 경과 0이면
// disabled)").
export default function SubjectTimerCard({
  label,
  colorKey,
  targetHours,
  elapsedSeconds,
  running,
  onToggle,
  onReset
}) {
  const targetSeconds = targetHours * 3600;
  // 도트·진행바 채움은 배경(칩)용 파스텔이 아니라 진한 2단계 톤을 쓴다(코드 검수 §2) —
  // surface-01/surface-04 위에서 파스텔이 거의 안 보이던 문제.
  const dotClass = getSubjectStrongClass(colorKey);
  const resetDisabled = elapsedSeconds === 0 && !running;

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-line/60 bg-white px-[1.75rem] py-[1.5rem]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full ${dotClass}`} />
          <span className="text-[1rem] font-bold leading-[1.4] text-ink-strong">{label}</span>
        </div>
        <span className="shrink-0 text-[0.8125rem] leading-[1.4] text-ink-sub">목표 {targetHours}h</span>
      </div>

      <p
        className={`text-[1.75rem] font-bold leading-[1.2] tabular-nums ${
          running ? 'text-ink-strong' : 'text-ink-sub'
        }`}
      >
        {formatClock(elapsedSeconds)}
      </p>

      <GoalProgressBar
        value={Math.min(elapsedSeconds, targetSeconds)}
        max={targetSeconds}
        thickness="0.75rem"
        fillClassName={dotClass}
      />

      <div className="flex items-center gap-[0.375rem]">
        <button
          type="button"
          onClick={onToggle}
          className={`h-[2.4375rem] flex-1 rounded-lg text-[0.9375rem] font-semibold leading-[1.2] transition-colors ${
            running ? 'border border-line bg-white text-ink-strong' : 'bg-primary text-white'
          }`}
        >
          {running ? '일시정지' : '시작'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={resetDisabled}
          aria-label={`${label} 타이머 리셋`}
          className="flex h-[2.4375rem] w-[2.75rem] shrink-0 items-center justify-center rounded-lg border border-line text-ink-sub transition-colors hover:enabled:border-ink-strong hover:enabled:text-ink-strong disabled:opacity-40"
        >
          <RotateCcw size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
