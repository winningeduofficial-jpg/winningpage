// 2페이지 첫 섹션 — §타이틀(학교 생활 및 입시 준비도) + 종합점수 + 요약 2줄.
// props: { scoreLabel, summaryLines } — data.readiness 에서 전달.
const ReadinessOverview = ({ scoreLabel, summaryLines }) => {
  return (
    <section className="mt-12">
      <h2 className="text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
        학교 생활 및 입시 준비도
      </h2>

      <div className="mt-6 flex items-center gap-3">
        <span className="text-[1.1875rem] font-medium text-[#525252]">종합점수</span>
        <span className="text-[1.25rem] font-medium text-[#013262]">{scoreLabel}</span>
      </div>

      <div className="mt-4 w-[30.5625rem] text-base font-normal leading-[1.3] text-[#808080]">
        {summaryLines.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </section>
  );
};

export default ReadinessOverview;
