// 목표관리 앱 D-day 뱃지 — docs/figma-goal/00-INDEX.md §5-4 `DdayBadge`.
// 색 스케일은 시안에 규칙이 명시돼 있지 않다(part-07 §262 "임박도 따라 색이 바뀌는 규칙(추정)").
// #20 실측 3건(D-3=빨강 / D-9=주황 / D-21=파랑)에서 역산한 임계값(≤7 레드, ≤14 앰버, 그 외
// 블루 — part-04 §273 "추정")을 그대로 채택했다. 정확한 HEX는 변수 미연결이라 근사값(추정).
function tierOf(dday) {
  const n = Number(String(dday).replace(/^D-?/i, ''));
  if (Number.isNaN(n)) return 'blue';
  if (n <= 7) return 'red';
  if (n <= 14) return 'amber';
  return 'blue';
}

const TONE_CLASS = {
  red: 'bg-[#FCE4E4] text-[#D14343]',
  amber: 'bg-[#FDECD2] text-[#B9740D]',
  blue: 'bg-[#E3EEFC] text-[#1D5FBF]'
};

export default function GoalDdayBadge({ dday }) {
  const toneClass = TONE_CLASS[tierOf(dday)];
  return (
    <span
      className={`inline-flex h-[2rem] w-fit shrink-0 items-center justify-center rounded-full px-3 text-[0.8125rem] font-semibold leading-[1.2] ${toneClass}`}
    >
      {dday}
    </span>
  );
}
