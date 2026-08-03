import ScoreBar from './ScoreBar';

// 6영역 수평 바 그래프 — StatusBadge 미사용(상태는 일반 텍스트), ScoreBar 소비.
// fill 폭은 ScoreBar 내부에서 점수→폭 선형 환산(결정6)으로 렌더된다.
// props: { areas } = [{ name, score, tone, status }] x6 — data.readiness.areas.
const DimensionBarChart = ({ areas }) => {
  return (
    <div className="mt-6 flex flex-col gap-2">
      {areas.map((area) => (
        <div key={area.name} className="flex h-5 items-center gap-[3.75rem]">
          <span className="w-[4.625rem] shrink-0 text-base text-[#525252]">{area.name}</span>
          <ScoreBar score={area.score} tone={area.tone} />
          <span className="w-[3.75rem] shrink-0 whitespace-nowrap text-base text-[#525252]">
            {area.status}
          </span>
        </div>
      ))}
    </div>
  );
};

export default DimensionBarChart;
