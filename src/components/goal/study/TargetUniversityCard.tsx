import GoalCard from "@/components/goal/GoalCard";
import GoalProgressBar from "@/components/goal/GoalProgressBar";

// 내 목표 대학(#24) 상단 카드 — 이상/최소 목표 대학 공용. part-08 §298~300/320~323.
// 대시보드 우측 레일의 `TargetUniversityRail`(components/goal/dashboard/, 372px 축약판)과 데이터
// 소스(src/lib/goal/targetUniversities.ts mapTargetUniversities())는 같지만, 이 화면은
// 680×348(42.5rem×21.75rem) 풀 사이즈 카드라 별도 컴포넌트로 새로 둔다 — dashboard/
// 디렉터리는 파일 소유권상 쓰기 금지이기도 하다.
//
// ⚠︎ 라벨 %와 채움 폭이 시안에서 불일치한다(part-08 §333) → GoalProgressBar가 value/max 비례로
// 계산하므로 여기서는 절대 px를 다루지 않는다.
type RateRowProps = {
  label: string;
  value: number;
  dotClassName: string;
  fillClassName: string;
  available?: boolean | undefined;
};

// available=false(정시 컷 미확보)면 라벨·자리는 그대로 두고 값만 "미산출"로 바꾼다 —
// 대시보드 TargetUniversityRail의 RateRow와 같은 규약(null과 0%를 시각적으로 구분).
function RateRow({
  label,
  value,
  dotClassName,
  fillClassName,
  available = true,
}: RateRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${available ? dotClassName : "bg-line"}`}
      />
      <span className="w-24 shrink-0 text-[0.9375rem] leading-[1.4] text-ink">
        {label}
      </span>
      <GoalProgressBar
        value={available ? value : 0}
        max={100}
        thickness="0.75rem"
        fillClassName={available ? fillClassName : "bg-surface-01"}
        className="flex-1"
      />
      {available ? (
        <span className="w-12 shrink-0 text-right text-[1rem] font-bold leading-[1.4] text-ink-strong">
          {value}%
        </span>
      ) : (
        <span className="min-w-12 shrink-0 whitespace-nowrap text-right text-[0.8125rem] font-medium leading-[1.4] text-ink-sub">
          미산출
        </span>
      )}
    </div>
  );
}

type TargetUniversityCardProps = {
  label: string;
  university: string;
  department: string;
  susiRate: number;
  jeongsiRate: number;
  jungsiAvailable?: boolean | undefined;
};

export default function TargetUniversityCard({
  label,
  university,
  department,
  susiRate,
  jeongsiRate,
  jungsiAvailable,
}: TargetUniversityCardProps) {
  return (
    <GoalCard tone="neutral" className="flex flex-col gap-8 px-8 py-7.5">
      <div>
        <p className="text-[0.875rem] leading-[1.4] text-ink-sub">{label}</p>
        <p className="mt-2 text-[1.75rem] font-bold leading-[1.4] text-ink-strong">
          {university} {department}
        </p>
      </div>
      {/* 시안 대학명 아래 y=376~460 구간은 빈 여백(part-08 §301, 추정: 변경 버튼/추가 정보 자리) —
          시안에 편집 진입점이 없어(작업 지시 §1-3) 의도적으로 요소를 두지 않는다. */}
      <div className="flex flex-col gap-4">
        <RateRow
          label="수시 합격률"
          value={susiRate}
          dotClassName="bg-[#5AA6F0]"
          fillClassName="bg-[#CCE4F7]"
        />
        <RateRow
          label="정시 합격률"
          value={jeongsiRate}
          dotClassName="bg-[#6FC98A]"
          fillClassName="bg-[#ABDFBA]"
          available={jungsiAvailable}
        />
      </div>
    </GoalCard>
  );
}
