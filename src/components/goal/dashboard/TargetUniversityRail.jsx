import GoalCard from "../GoalCard";
import GoalProgressBar from "../GoalProgressBar";

// 우측 레일 "이상목표대학"/"최소목표대학" 카드 2장(372×195 = 23.25rem×12.1875rem, part-07 #20).
// 합격률 게이지(335×6 = 20.9375rem×0.375rem)도 라벨 % 기준 비례 계산(시안 px 불일치 — 확정사항 3).
//
// available=false(정시 컷 미확보, §7-1-A)면 카드 자리·라벨은 그대로 유지한 채 값 자리만
// "미산출"로 바꾼다. 카드를 숨기면 학생이 "정시는 원래 없는 기능"으로 오해한다(임무 지시).
// null(미산출)과 0%(가망 없음)는 반드시 시각적으로 구분돼야 하므로, 점·게이지 채움색도
// 회색 톤으로 낮춰 "값이 없다"를 값(0%)과 구분한다.
function RateRow({
  label,
  value,
  dotClassName,
  fillClassName,
  available = true,
}) {
  return (
    <div className="flex items-center gap-2">
      {/* line(#d7d7d7)은 이 코드베이스의 "비활성" 토큰이다(tailwind.config.js 주석: 비활성
          버튼·보더·미체크) — 별도 disabled 톤을 새로 만들지 않고 기존 관례를 따른다. */}
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${available ? dotClassName : "bg-line"}`}
      />
      <span className="w-[5rem] shrink-0 text-[0.8125rem] leading-[1.4] text-ink">
        {label}
      </span>
      <GoalProgressBar
        value={available ? value : 0}
        max={100}
        thickness="0.375rem"
        fillClassName={available ? fillClassName : "bg-surface-01"}
        className="flex-1"
      />
      {available ? (
        <span className="w-[2.5rem] shrink-0 text-right text-[0.8125rem] font-semibold leading-[1.4] text-ink-strong">
          {value}%
        </span>
      ) : (
        <span className="min-w-[2.5rem] shrink-0 whitespace-nowrap text-right text-[0.75rem] font-medium leading-[1.4] text-ink-sub">
          미산출
        </span>
      )}
    </div>
  );
}

function UniversityCard({
  label,
  university,
  department,
  susiRate,
  jeongsiRate,
  jungsiAvailable,
}) {
  return (
    <GoalCard
      tone="neutral"
      className="flex flex-col gap-4 px-[1.25rem] py-[1.25rem]"
    >
      <div>
        <p className="text-[0.8125rem] leading-[1.4] text-ink-sub">{label}</p>
        <p className="mt-1 text-[1.0625rem] font-bold leading-[1.4] text-ink-strong">
          {university} {department}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {/* 수시는 온보딩 게이트(hasSusiCuts)라 여기 도달한 학생은 항상 값이 있다 — available 생략(기본 true). */}
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

export default function TargetUniversityRail({ data }) {
  return (
    <>
      <UniversityCard
        label={data.upper.label}
        university={data.upper.university}
        department={data.upper.department}
        susiRate={data.upper.susiRate}
        jeongsiRate={data.upper.jeongsiRate}
        jungsiAvailable={data.upper.jungsiAvailable}
      />
      <UniversityCard
        label={data.lower.label}
        university={data.lower.university}
        department={data.lower.department}
        susiRate={data.lower.susiRate}
        jeongsiRate={data.lower.jeongsiRate}
        jungsiAvailable={data.lower.jungsiAvailable}
      />
    </>
  );
}
