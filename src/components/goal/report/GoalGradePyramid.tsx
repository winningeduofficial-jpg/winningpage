// 등급 피라미드(QA 행301) — 과목(군) 카드마다 1개. scaleMax(5|9)단 역피라미드로, 1등급 행이
// 가장 좁고 아래로 갈수록(등급 나쁠수록) 넓어진다(원본 target LearningDirectionReportModal.tsx
// Pyramid 컴포넌트, docs/figma-goal/target-app-analysis.md §4.7 "행 너비 = 36 + row*(60/max)%").
//
// 원본은 px 고정값(ROW_HEIGHT=24/GAP=4/MARKER=20/MARKER_OFFSET_X=30)을 쓰지만 이 저장소
// CSS 단위 규칙(rem만)에 맞춰 16으로 나눠 그대로 옮긴다(24px→1.5rem, 4px→0.25rem,
// 20px→1.25rem). 마커는 현재 등급의 연속 좌표(반올림 없이) — 활성 행 배경은 round(grade)로
// 정한 행 하나뿐이다(원본과 동일하게 "가장 가까운 행 강조 + 정확한 위치는 마커로" 이원화).
//
// 활성 행 색은 이 카드 트리에서 기존에 이미 쓰고 있는 배지 색(SubjectDirectionCard.tsx
// bg-[#E0DDF4]/text-[#5B4E9E])과 통일한다 — src/index.css에 그 톤의 토큰이 아직 없어
// 새 하드코딩이 아니라 기존 하드코딩과 글자 단위로 맞춘 것이다(판단 지점).

const ROW_HEIGHT_REM = 1.5;
const ROW_GAP_REM = 0.25;
const MARKER_SIZE_REM = 1.25;

type GoalGradePyramidProps = {
  subjectLabel: string;
  grade: number | null | undefined;
  scaleMax: 5 | 9;
};

export default function GoalGradePyramid({
  subjectLabel,
  grade,
  scaleMax,
}: GoalGradePyramidProps) {
  const hasGrade =
    typeof grade === "number" && Number.isFinite(grade) && grade > 0;
  const clampedGrade = hasGrade
    ? Math.min(scaleMax, Math.max(1, grade as number))
    : null;
  const activeRow =
    clampedGrade != null
      ? Math.min(scaleMax, Math.max(1, Math.round(clampedGrade)))
      : null;

  const rows = Array.from({ length: scaleMax }, (_, i) => i + 1);
  const containerHeightRem =
    scaleMax * ROW_HEIGHT_REM + (scaleMax - 1) * ROW_GAP_REM;

  const markerTopRem =
    clampedGrade != null
      ? (clampedGrade - 1) * (ROW_HEIGHT_REM + ROW_GAP_REM) +
        ROW_HEIGHT_REM / 2 -
        MARKER_SIZE_REM / 2
      : null;

  const gradeLabel = hasGrade
    ? `${(grade as number).toFixed(1)}등급`
    : "미입력";

  return (
    <div
      role="img"
      aria-label={`${subjectLabel} ${gradeLabel}, ${scaleMax}등급제`}
      className="relative flex flex-col items-end"
      style={{ height: `${containerHeightRem}rem`, gap: `${ROW_GAP_REM}rem` }}
    >
      {rows.map((row) => {
        const isActive = activeRow === row;
        const widthPercent = 36 + row * (60 / scaleMax);
        return (
          <div
            key={row}
            aria-hidden="true"
            className={`flex h-6 items-center justify-center rounded-md border text-[0.6875rem] font-semibold leading-[1.4] ${
              isActive
                ? "border-[#5B4E9E] bg-[#E0DDF4] text-[#5B4E9E] shadow-sm"
                : "border-goal-cardTone-neutral bg-goal-cardTone-neutral text-ink-sub"
            }`}
            style={{ width: `${widthPercent}%` }}
          >
            {row}등급
          </div>
        );
      })}
      {markerTopRem != null && (
        <div
          aria-hidden="true"
          className="absolute right-0 rounded-full border-2 border-[#5B4E9E] bg-white"
          style={{
            top: `${markerTopRem}rem`,
            width: `${MARKER_SIZE_REM}rem`,
            height: `${MARKER_SIZE_REM}rem`,
          }}
        />
      )}
    </div>
  );
}
