// 점수 게이지 바 공용 원자. fill 폭 = 점수→트랙 폭 선형 환산(결정6, 시안 px 더미 폐기).
const FILL_COLORS = {
  red: '#991e1e',
  amber: '#736123',
  blue: '#1b5da0',
};

export default function ScoreBar({ score, max = 100, tone = 'blue', className = '' }) {
  const percent = Math.max(0, Math.min(100, (score / max) * 100));

  return (
    <div
      className={`h-[0.625rem] w-[14.4375rem] overflow-hidden rounded-[0.25rem] bg-[#e5e5e5] ${className}`}
    >
      <div
        className="h-full rounded-[0.25rem]"
        style={{ width: `${percent}%`, backgroundColor: FILL_COLORS[tone] ?? FILL_COLORS.blue }}
      />
    </div>
  );
}
