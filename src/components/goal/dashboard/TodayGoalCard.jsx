import GoalCard from '../GoalCard';
import GoalProgressBar from '../GoalProgressBar';

// 대시보드 "오늘의 목표" 카드 — part-07 #20(카드 배경 정본, 1076×409 = 67.25rem×25.5625rem).
// #21의 "카드 배경 1076×12 축소"는 시안 편집 사고로 판단해 채택하지 않는다(작업 지시 §확정사항 6).
//
// hasRecord는 studyHours로 파생한다: 0이면 #12(미기록, 버튼 "기록 저장"), 그 외면 #20(기록됨,
// 버튼 "기록 수정"). 게이지 채움 폭은 GoalProgressBar가 value/max로 계산한다(px 하드코딩 금지).
function GoalRateRow({ label, value, dotClassName, fillClassName }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`} />
      <span className="w-[9.5rem] shrink-0 text-[0.875rem] leading-[1.4] text-ink">{label}</span>
      <GoalProgressBar value={value} max={100} thickness="0.75rem" fillClassName={fillClassName} className="flex-1" />
      <span className="w-[3rem] shrink-0 text-right text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">
        {value}%
      </span>
    </div>
  );
}

function quickAddLabel(hours) {
  return hours < 1 ? `+ ${hours * 60}분` : `+ ${hours}시간`;
}

export default function TodayGoalCard({ data }) {
  const hasRecord = data.studyHours > 0;

  return (
    <GoalCard tone="neutral" className="flex h-[25.5625rem] flex-col gap-6 px-[2rem] py-[1.875rem]">
      <div>
        <h2 className="text-[1.25rem] font-bold leading-[1.4] text-ink-strong">오늘의 목표</h2>
        <p className="mt-1 text-[0.875rem] leading-[1.4] text-ink-sub">기록하면 즉시 달성률에 반영돼요</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-04 px-[1.875rem] py-[1.5rem]">
        <span className="shrink-0 text-[0.9375rem] font-semibold leading-[1.4] text-ink-strong">
          오늘 순공 시간
        </span>
        <div className="flex h-[3.125rem] w-[12rem] shrink-0 items-center justify-end gap-1 rounded-lg border border-line bg-white px-4">
          <span className="text-[1.25rem] font-bold leading-[1.2] text-ink-strong">
            {data.studyHours.toFixed(1)}
          </span>
          <span className="text-[0.875rem] leading-[1.4] text-ink-sub">시간</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.quickAddOptions.map((hours) => (
            <button
              key={hours}
              type="button"
              // TODO(다음 단계): 순공 시간 증분은 실데이터 연동 이후 붙인다. 현재는 목업만 표시.
              className="h-8 shrink-0 rounded-full border border-line px-3 text-[0.8125rem] leading-[1.2] text-ink transition-colors hover:border-ink-strong"
            >
              {quickAddLabel(hours)}
            </button>
          ))}
        </div>
        <button
          type="button"
          // TODO(다음 단계): 기록 저장/수정 API 연동.
          className="ml-auto h-[3.125rem] shrink-0 rounded-lg bg-primary px-6 text-[0.9375rem] font-semibold leading-[1.2] text-white"
        >
          {hasRecord ? '기록 수정' : '기록 저장'}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <GoalRateRow
          label="이상 목표 학습 시간"
          value={data.upperGoalRate}
          dotClassName="bg-[#5AA6F0]"
          fillClassName="bg-[#CCE4F7]"
        />
        <GoalRateRow
          label="최소 목표 학습 시간"
          value={data.lowerGoalRate}
          dotClassName="bg-[#6FC98A]"
          fillClassName="bg-[#ABDFBA]"
        />
      </div>
    </GoalCard>
  );
}
