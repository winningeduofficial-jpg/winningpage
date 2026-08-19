// 목표관리 앱 D-day 뱃지 — docs/figma-goal/00-INDEX.md §5-4 `DdayBadge`.
// 색 스케일은 시안에 규칙이 명시돼 있지 않다(part-07 §262 "임박도 따라 색이 바뀌는 규칙(추정)").
// #20 실측 3건(D-3=빨강 / D-9=주황 / D-21=파랑)에서 역산한 임계값(≤7 레드, ≤14 앰버)을
// 그대로 채택했다. 15일 이상 톤은 2026-08-13 확정으로 파랑 → 회색(neutral)으로 바꿨다
// (중요일정 D 백엔드 배선 UoW, 팀장 확정 사항) — D-7 이내 빨강 · D-14 이내 주황은 그대로다.
// 정확한 HEX는 변수 미연결이라 근사값(추정).
function tierOf(dday: unknown) {
  const n = Number(String(dday).replace(/^D-?/i, ""));
  if (Number.isNaN(n)) return "gray";
  if (n <= 7) return "red";
  if (n <= 14) return "amber";
  return "gray";
}

const TONE_CLASS: Record<string, string> = {
  red: "bg-[#FCE4E4] text-[#D14343]",
  amber: "bg-[#FDECD2] text-[#B9740D]",
  gray: "bg-[#EDEDED] text-ink-sub",
};

type GoalDdayBadgeProps = {
  dday?: string | number | null;
};

export default function GoalDdayBadge({ dday }: GoalDdayBadgeProps) {
  const toneClass = TONE_CLASS[tierOf(dday)];
  return (
    <span
      className={`inline-flex h-8 w-fit shrink-0 items-center justify-center rounded-full px-3 text-[0.8125rem] font-semibold leading-[1.2] ${toneClass}`}
    >
      {dday}
    </span>
  );
}
