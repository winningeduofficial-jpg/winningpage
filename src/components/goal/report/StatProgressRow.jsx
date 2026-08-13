import GoalProgressBar from "../GoalProgressBar";

// 리포트 카드 내 반복되는 "라벨 / 값 / 진행바" 한 행 — docs/figma-goal/00-INDEX.md §5-4
// `ProgressRow`. 시간대별 학습 효율·학습 방해요인·완료한 핵심 학습 항목·과목별 학습 비중 등
// 여러 카드가 공유하는 최소 단위다.
//
// `max`는 호출부가 결정한다: 퍼센트형 데이터(과목 비중 등)는 100 고정, 횟수/시간형 데이터
// (시간대별 학습 효율, 방해요인 등)는 카드 내 값들 중 최댓값을 넘겨 "가장 큰 값이 꽉 찬 막대"가
// 되도록 상대 비교로 렌더한다 — 시안 px 채움 폭이 표시 값과 불일치하는 문제(결함2)를 피하기 위해
// 반드시 값 기준으로만 계산한다(GoalProgressBar 자체가 value/max 비례 계산을 강제).
export default function StatProgressRow({
  label,
  value,
  unit = "",
  max,
  fillClassName,
}) {
  const denom = max && max > 0 ? max : value || 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-[0.8125rem] leading-[1.4]">
        <span className="text-ink">{label}</span>
        <span className="font-semibold text-ink-strong">
          {value}
          {unit}
        </span>
      </div>
      <GoalProgressBar
        value={value}
        max={denom}
        thickness="0.375rem"
        fillClassName={fillClassName}
      />
    </div>
  );
}
