// 요약 카드 3장 — 학습 실행 역량 / 학교생활 준비도 / 가장 시급한 영역.
// 카드 간 x 간격은 시안(19/18 불균등)을 균등 정규화(justify-between, SPEC 승인).
export default function SummaryCards({ cards }) {
  return (
    <div className="flex w-[62.5rem] justify-between">
      {cards.map((card) => (
        <div
          key={card.label}
          className="h-[8.875rem] w-[20.0625rem] rounded-[1.25rem] border border-[#d7d7d7] bg-white pl-[1.1875rem] pt-[1.75rem]"
        >
          <div className="flex flex-col gap-3">
            <p className="text-[1.1875rem] font-medium leading-[1.25rem] text-[#525252]">
              {card.label}
            </p>
            <p className="text-[1.25rem] font-medium leading-[1.25rem] text-[#013262]">
              {card.value}
            </p>
            <p className="text-base font-normal leading-[1.25rem] text-[#013262]">{card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
