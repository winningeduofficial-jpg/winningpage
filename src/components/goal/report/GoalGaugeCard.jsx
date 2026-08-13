import GoalCard from "../GoalCard";
import GoalProgressBar from "../GoalProgressBar";
import DeltaBadge from "../DeltaBadge";

// 성적 관리 KPI 게이지 카드(680×207, #35) — 목표까지 격차를 진행바 + 목표 마커(세로선)로 표시.
//
// 목표 마커 위치·채움 비율 계산 규칙이 시안에 없다(part-12 §240 "값 기준 계산" 지시만 존재) —
// 판단이 필요했던 지점(작업 보고 참고). 두 도메인으로 구분해 구현했다:
//   - lowerIsBetter(등급, 내신): 9등급제(1=최상 ~ 9=최하) 스케일로 보고
//     fillPct = (9-value)/(9-1)*100, targetPct = (9-target)/(9-1)*100 — 등급 숫자가 작을수록
//     채움이 커진다(값이 좋아질수록 게이지가 채워지는 방향으로 통일).
//   - !lowerIsBetter(백분위, 모의고사): 0~100 스케일 그대로 fillPct=value, targetPct=target.
// target 자체는 데이터에 별도 필드가 없어 remaining으로 역산한다(mockGrades.kpi 스키마 그대로):
//   lowerIsBetter → target = value - remaining, 아니면 target = value + remaining.
//   (예: 내신 3.24 - 0.53 = 2.71 ✅ / 모의고사 78.4 + 13.6 = 92.0 ✅ — mockGrades 값으로 검증됨)
// remaining 이 없으면(목표 컷 데이터 미확보 — 성적 관리 실데이터 배선에서 처음 나온 경우다,
// targets.*.naesinCut/jungsiCut 이 null 일 수 있다) 목표 마커를 계산할 수 없다. targetPct를
// null 로 두어 호출부가 마커·목표 텍스트를 아예 생략하게 한다(가짜 목표를 그리지 않는다).
function computeGauge({ value, remaining, lowerIsBetter }) {
  const clamp = (n) => Math.min(100, Math.max(0, n));

  if (lowerIsBetter) {
    const SCALE_MIN = 1;
    const SCALE_MAX = 9;
    const toFillPct = (v) =>
      clamp(((SCALE_MAX - v) / (SCALE_MAX - SCALE_MIN)) * 100);
    if (remaining == null)
      return { fillPct: toFillPct(value), targetPct: null };
    const target = value - remaining;
    return { fillPct: toFillPct(value), targetPct: toFillPct(target) };
  }

  if (remaining == null) return { fillPct: clamp(value), targetPct: null };
  const target = value + remaining;
  return { fillPct: clamp(value), targetPct: clamp(target) };
}

export default function GoalGaugeCard({
  label,
  round,
  value,
  unit,
  delta,
  targetLabel,
  remaining,
  lowerIsBetter = false,
}) {
  const { fillPct, targetPct } = computeGauge({
    value,
    remaining,
    lowerIsBetter,
  });

  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-[12.9375rem] w-full flex-col gap-5 px-8 py-7"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[0.9375rem] font-semibold leading-[1.4] text-ink-strong">
            {label}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-[0.75rem] font-medium leading-[1.4] text-ink-sub">
            {round}
          </span>
        </div>
        {delta != null && (
          <DeltaBadge value={delta} direction="up" tone="positive" />
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-[1.75rem] font-bold leading-[1.2] text-ink-strong">
          {value}
        </span>
        <span className="text-[0.9375rem] leading-[1.4] text-ink-sub">
          {unit}
        </span>
      </div>

      <div className="relative w-full pt-2">
        <GoalProgressBar value={fillPct} max={100} thickness="0.75rem" />
        {/* 목표 마커 — 진행바 위에 세로선으로 겹쳐 그린다(part-12 §195 "목표 마커 세로선").
            targetPct가 없으면(목표 컷 미확보) 그리지 않는다 — 위치 없는 마커를 0%에 붙여
            그리면 거짓 정보가 된다. */}
        {targetPct != null && (
          <span
            aria-hidden="true"
            className="absolute top-0 h-[1.25rem] w-px -translate-x-1/2 bg-ink-strong"
            style={{ left: `${targetPct}%` }}
          />
        )}
      </div>

      {targetPct != null && (
        <div className="flex items-center justify-between gap-3 text-[0.75rem] leading-[1.4] text-ink-sub">
          <span>{targetLabel}</span>
          <span>목표까지 {remaining}</span>
        </div>
      )}
    </GoalCard>
  );
}
