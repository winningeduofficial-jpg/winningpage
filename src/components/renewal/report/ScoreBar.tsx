// 점수 게이지 바 공용 원자. fill 폭 = 점수→트랙 폭 선형 환산(결정6, 시안 px 더미 폐기).
const FILL_COLORS: Record<string, string> = {
  red: "#991e1e",
  amber: "#736123",
  blue: "#1b5da0",
};

// responsive=true(R3, 2026-08-11) — 트랙 폭을 모바일에서 w-full(부모 flex 아이템에 맞춰
// 유동), lg 이상에서 원래 고정폭(14.4375rem)으로 되돌린다. 기본값 false 인 기존 호출부
// (PriorityTable 데스크톱 그리드 등)는 폭이 전혀 바뀌지 않는다.
//
// F-20(2026-08-11) — 두 prop 추가:
//   trackClass : 트랙 폭 클래스를 호출부가 지정한다(PriorityTable 이 숫자 자리를 만들려고 짧게 준다).
//                주면 responsive 보다 우선한다. 안 주면 기존 동작 그대로다.
//   decorative : 옆에 점수 숫자가 **텍스트로** 있을 때 true. 그때 바는 같은 값의 중복 낭독이라
//                aria-hidden 으로 뺀다. false(기본)면 바 자체가 값의 유일한 표현이므로
//                role="img" + aria-label 로 값을 읽어 준다 — 종전에는 어느 쪽도 아니어서
//                DimensionBarChart 의 점수가 스크린리더에 통째로 누락됐다(레이아웃 변경 0으로 함께 해소).
type ScoreBarProps = {
  score: number;
  max?: number;
  tone?: string;
  responsive?: boolean;
  trackClass?: string | null;
  decorative?: boolean;
  className?: string;
};

export default function ScoreBar({
  score,
  max = 100,
  tone = "blue",
  responsive = false,
  trackClass = null,
  decorative = false,
  className = "",
}: ScoreBarProps) {
  const percent = Math.max(0, Math.min(100, (score / max) * 100));
  const widthClass =
    trackClass ?? (responsive ? "w-full lg:w-[14.4375rem]" : "w-[14.4375rem]");
  const a11yProps: Record<string, string> = decorative
    ? { "aria-hidden": "true" }
    : { role: "img", "aria-label": `${score}점` };

  return (
    <div
      {...a11yProps}
      className={`h-[0.625rem] overflow-hidden rounded-[0.25rem] bg-[#e5e5e5] ${widthClass} ${className}`}
    >
      <div
        className="h-full rounded-[0.25rem]"
        style={{
          width: `${percent}%`,
          backgroundColor: FILL_COLORS[tone] ?? FILL_COLORS.blue,
        }}
      />
    </div>
  );
}
