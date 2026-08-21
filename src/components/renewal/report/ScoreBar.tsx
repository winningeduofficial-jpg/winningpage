// 점수 게이지 바 공용 원자. fill 폭 = 점수→트랙 폭 선형 환산(결정6, 시안 px 더미 폐기).
// Figma 시안(1889-12784) 확정 팔레트 — 뮤티드 톤, StatusBadge와 동일 계열(2026-08-20).
const FILL_COLORS: Record<string, string> = {
  red: "#98504D",
  amber: "#9A843F",
  blue: "#496C99",
};

// A4 출력물 컨셉(2026-08-20) — 트랙은 항상 시안 고정폭(14.4375rem). 종전 responsive(모바일
// w-full 리플로우) · trackClass/decorative(F-20 숫자 병기 레이아웃) prop은 호출부가 전부
// 사라져 제거했다. 바 자체가 값의 유일한 표현이므로 role="img" + aria-label 로 값을 읽어 준다.
type ScoreBarProps = {
  score: number;
  max?: number;
  tone?: string;
  className?: string;
};

export default function ScoreBar({
  score,
  max = 100,
  tone = "blue",
  className = "",
}: ScoreBarProps) {
  const percent = Math.max(0, Math.min(100, (score / max) * 100));

  return (
    <div
      role="img"
      aria-label={`${score}점`}
      className={`h-2.5 w-57.75 overflow-hidden rounded-sm bg-[#d9d9d9] ${className}`}
    >
      <div
        className="h-full rounded-sm"
        style={{
          width: `${percent}%`,
          backgroundColor: FILL_COLORS[tone] ?? FILL_COLORS.blue,
        }}
      />
    </div>
  );
}
