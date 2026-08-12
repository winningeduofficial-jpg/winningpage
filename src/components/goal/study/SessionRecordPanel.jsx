import GoalCard from '../GoalCard';
import { getSubjectStrongClass } from '../subjectTokens';

// 오늘 세션 기록 패널(#25 우측, 420×382 = 26.25rem×23.875rem). part-09 §81~85 내부 스펙.
// 상태 라벨은 시안에 `측정 완료`/`진행 중` 2종만 등장하고 "일시정지" 상태 라벨은 미정의다
// (part-09 §143 "정의 필요"). 진행 중이 아니고 경과 시간이 있으면 `측정 완료`로 잠정 처리한다(추정).
export default function SessionRecordPanel({ subjects }) {
  return (
    <GoalCard tone="neutral" className="flex h-full flex-col gap-4 px-[1.875rem] py-[1.875rem]">
      <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">오늘 세션 기록</h3>
      <ul className="flex flex-col gap-3">
        {subjects.map((subject) => {
          const minutes = Math.floor(subject.elapsedSeconds / 60);
          const status = subject.running ? '진행 중' : minutes > 0 ? '측정 완료' : '아직 시작 전';
          return (
            <li key={subject.id} className="flex h-[3.75rem] items-center gap-3 rounded-lg bg-surface-04 px-4">
              <span
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 rounded-full ${getSubjectStrongClass(subject.id)}`}
              />
              <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold leading-[1.4] text-ink-strong">
                {subject.label}
              </span>
              <span className="shrink-0 text-[0.8125rem] leading-[1.4] text-ink-sub">{status}</span>
              <span className="w-[3rem] shrink-0 text-right text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">
                {minutes}분
              </span>
            </li>
          );
        })}
      </ul>
    </GoalCard>
  );
}
