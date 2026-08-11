// 요약 카드 3장 — 학습 실행 역량 / 학교생활 준비도 / 가장 시급한 영역.
// 카드 간 x 간격은 시안(19/18 불균등)을 균등 정규화(justify-between, SPEC 승인).
// R3(2026-08-11) — 3장을 가로로 나열하는 w-[62.5rem]은 모바일에서 압축 대상이 아니라 쌓기
// 대상이다. flex-col + gap 로 세로 스택, 카드 자체는 w-full(높이 고정 h-[8.875rem] 도 제거해
// 실제 3줄 텍스트 높이만큼만 차지하게 한다).
export default function SummaryCards({ cards }) {
  return (
    // fd-summary-cards/-card — 인쇄 훅(BLOCK 수정). report-print.css 가 기존 lg: 리터럴과
    // 동일한 값으로 강제한다.
    <div className="fd-summary-cards flex w-full flex-col gap-3 lg:w-[62.5rem] lg:flex-row lg:justify-between lg:gap-0">
      {cards.map((card) => (
        <div
          key={card.label}
          className="fd-summary-card w-full rounded-[1.25rem] border border-[#d7d7d7] bg-white px-5 py-5 lg:h-[8.875rem] lg:w-[20.0625rem] lg:pl-[1.1875rem] lg:pt-[1.75rem]"
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
