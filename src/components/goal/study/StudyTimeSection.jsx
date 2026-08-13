import GoalCard from "../GoalCard";
import GoalCardHeader from "../GoalCardHeader";
import { getSubjectStrongClass } from "../subjectTokens";

// 섹션1 "과목별 순공 시간"(#26, 1190×571). part-09 §169~175.
//
// 읽기 전용이다 — #25 열공 타이머에서 종료 시 자동 유입되는 값으로 추정된다(part-09 §241 "종료 시
// 오늘의 공부 기록과 순공 시간에 자동 반영됩니다" + 여기 상태 문구 `아직 기록 없음` 근거). 이
// 페이지 자체에는 직접 입력 UI가 시안에 없다.
//
// ⚠︎ 대시보드 "오늘의 목표" 카드(TodayGoalCard, components/goal/dashboard/)에도 순공 시간을 직접
// 입력하는 경로(+30분/+1시간 등 퀵칩)가 별도로 있다. 두 값 중 무엇이 최종값인지, 동시 존재 시
// 충돌을 어떻게 해소할지는 시안에 규칙이 없다(part-09 §241 "수기 입력 경로가 필요한지는 확인
// 필요") — 이번 구현은 읽기 전용으로만 두고 이중화 충돌 해소는 범위 밖으로 남긴다.
export default function StudyTimeSection({ rows, totalHours }) {
  return (
    <GoalCard
      tone="neutral"
      className="flex flex-col gap-5 px-[2rem] py-[1.875rem]"
    >
      <div>
        <GoalCardHeader title="과목별 순공 시간" />
        <p className="mt-1 text-[0.875rem] leading-[1.4] text-ink-sub">
          합계가 오늘의 목표 달성률로 계산돼요
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex h-[3.75rem] items-center gap-3 rounded-lg bg-surface-04 px-5"
          >
            <span
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 rounded-full ${getSubjectStrongClass(row.id)}`}
            />
            <span className="w-[4rem] shrink-0 text-[0.9375rem] font-semibold leading-[1.4] text-ink-strong">
              {row.label}
            </span>
            <span className="min-w-0 flex-1 text-[0.8125rem] leading-[1.4] text-ink-sub">
              {row.hours > 0
                ? `${row.hours.toFixed(1)}시간 기록됨`
                : "아직 기록 없음"}
            </span>
            <span className="shrink-0 text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">
              {row.hours.toFixed(1)}h
            </span>
          </li>
        ))}
        <li className="flex h-[3.75rem] items-center gap-3 rounded-lg bg-surface-04 px-5">
          <span className="w-[4rem] shrink-0 text-[0.9375rem] font-semibold leading-[1.4] text-ink-sub">
            합계
          </span>
          <span className="min-w-0 flex-1" />
          <span className="shrink-0 text-[0.9375rem] font-bold leading-[1.4] text-ink-sub">
            {totalHours.toFixed(1)}h
          </span>
        </li>
      </ul>
    </GoalCard>
  );
}
