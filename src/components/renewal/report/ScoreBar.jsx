// 점수 게이지 바 공용 원자. fill 폭 = 점수→트랙 폭 선형 환산(결정6, 시안 px 더미 폐기).
const FILL_COLORS = {
  red: '#991e1e',
  amber: '#736123',
  blue: '#1b5da0',
};

// responsive=true(R3, 2026-08-11) — 트랙 폭을 모바일에서 w-full(부모 flex 아이템에 맞춰
// 유동), lg 이상에서 원래 고정폭(14.4375rem)으로 되돌린다. 기본값 false 인 기존 호출부
// (PriorityTable 데스크톱 그리드 등)는 폭이 전혀 바뀌지 않는다.
export default function ScoreBar({ score, max = 100, tone = 'blue', responsive = false, className = '' }) {
  const percent = Math.max(0, Math.min(100, (score / max) * 100));
  const widthClass = responsive ? 'w-full lg:w-[14.4375rem]' : 'w-[14.4375rem]';

  return (
    <div
      className={`h-[0.625rem] overflow-hidden rounded-[0.25rem] bg-[#e5e5e5] ${widthClass} ${className}`}
    >
      <div
        className="h-full rounded-[0.25rem]"
        style={{ width: `${percent}%`, backgroundColor: FILL_COLORS[tone] ?? FILL_COLORS.blue }}
      />
    </div>
  );
}
