// 목표관리 앱 과목 칩 — docs/figma-goal/00-INDEX.md §5-4 `SubjectChip`.
// 과목·계획·방해요인·학습항목에 두루 쓰이며 시안에 높이 3스케일이 혼재한다(part-09 §273
// "h32 / h39 / h52 (3스케일) — 스케일 통일 필요"). 화면 사용처에 맞게 size prop으로 분기한다.
// pill이 아니라 소프트 라운드(6~8px) — 여기서는 8px(rounded-lg)로 통일.
//
// 색은 과목 토큰(goal.subject.*: korean/math/english/science/etc, tailwind.config.js)을 쓴다.
// 이전엔 요일 색(goal.weekday.*)용 `tone="weekday"` 변형도 있었지만 저장소 어디에서도 호출되지
// 않는 죽은 코드였다(WeekdayPlanBoard.jsx는 자체 WEEKDAY_BG_CLASS를 쓴다) — 코드 검수 NIT §6로
// 제거했다.
const SIZE_CLASS = {
  sm: "h-[2rem] px-2.5 text-[0.75rem]", // 32px
  md: "h-[2.4375rem] px-3 text-[0.8125rem]", // 39px
  lg: "h-[3.25rem] px-4 text-[0.9375rem]", // 52px
};

const SUBJECT_BG_CLASS = {
  korean: "bg-goal-subject-korean",
  math: "bg-goal-subject-math",
  english: "bg-goal-subject-english",
  science: "bg-goal-subject-science",
  etc: "bg-goal-subject-etc",
};

export default function SubjectChip({
  label,
  size = "md",
  color = "etc",
  className = "",
}) {
  const sizeClass = SIZE_CLASS[size] ?? SIZE_CLASS.md;
  const bgClass = SUBJECT_BG_CLASS[color] ?? SUBJECT_BG_CLASS.etc;

  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center justify-center rounded-lg font-medium leading-[1.2] text-ink-strong ${sizeClass} ${bgClass} ${className}`}
    >
      {label}
    </span>
  );
}
