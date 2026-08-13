// 주요 학습 특성 서술 3블록. §타이틀은 ReportPageOne 이 카드 위에서 한 번만 렌더하므로
// (SummaryCards·PriorityTable·TraitNarratives 공용 섹션) heading 은 접근성 라벨로만 소비한다.
export default function TraitNarratives({ items, heading }) {
  return (
    <div
      role="group"
      className="flex w-full flex-col gap-10"
      aria-label={heading}
    >
      {items.map((item) => (
        <div key={item.title} className="flex flex-col gap-3">
          <p className="text-base font-semibold leading-[1.4] text-[#525252]">
            {item.title}
          </p>
          <p className="text-base font-normal leading-[1.4] text-[#808080]">
            {item.body}
          </p>
        </div>
      ))}
    </div>
  );
}
