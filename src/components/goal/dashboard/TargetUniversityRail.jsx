import GoalCard from '../GoalCard';
import GoalProgressBar from '../GoalProgressBar';

// 우측 레일 "이상목표대학"/"최소목표대학" 카드 2장(372×195 = 23.25rem×12.1875rem, part-07 #20).
// 합격률 게이지(335×6 = 20.9375rem×0.375rem)도 라벨 % 기준 비례 계산(시안 px 불일치 — 확정사항 3).
function RateRow({ label, value, dotClassName, fillClassName }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`} />
      <span className="w-[5rem] shrink-0 text-[0.8125rem] leading-[1.4] text-ink">{label}</span>
      <GoalProgressBar value={value} max={100} thickness="0.375rem" fillClassName={fillClassName} className="flex-1" />
      <span className="w-[2.5rem] shrink-0 text-right text-[0.8125rem] font-semibold leading-[1.4] text-ink-strong">
        {value}%
      </span>
    </div>
  );
}

function UniversityCard({ label, university, department, susiRate, jeongsiRate }) {
  return (
    <GoalCard tone="neutral" className="flex flex-col gap-4 px-[1.25rem] py-[1.25rem]">
      <div>
        <p className="text-[0.8125rem] leading-[1.4] text-ink-sub">{label}</p>
        <p className="mt-1 text-[1.0625rem] font-bold leading-[1.4] text-ink-strong">
          {university} {department}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <RateRow label="수시 합격률" value={susiRate} dotClassName="bg-[#5AA6F0]" fillClassName="bg-[#CCE4F7]" />
        <RateRow label="정시 합격률" value={jeongsiRate} dotClassName="bg-[#6FC98A]" fillClassName="bg-[#ABDFBA]" />
      </div>
    </GoalCard>
  );
}

export default function TargetUniversityRail({ data }) {
  return (
    <>
      <UniversityCard
        label={data.upper.label}
        university={data.upper.university}
        department={data.upper.department}
        susiRate={data.upper.susiRate}
        jeongsiRate={data.upper.jeongsiRate}
      />
      <UniversityCard
        label={data.lower.label}
        university={data.lower.university}
        department={data.lower.department}
        susiRate={data.lower.susiRate}
        jeongsiRate={data.lower.jeongsiRate}
      />
    </>
  );
}
