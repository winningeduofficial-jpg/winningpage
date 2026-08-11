// 추천 지원 서비스 카드 2장 — 490x201, border #d1e8ff, 순위 타이틀 + 본문 + 칩 4개.
// 칩은 StatusBadge(blue)와 동일 시각(bg #f1f8ff / text #1b5da0)이나 폰트 크기만 달라
// 로컬 span 으로 구현(props 계약: RecommendServices 내부 전용, StatusBadge 미의존).
// props: { cards } = [{ rank, name, desc, chips: string[4] }] x2 — data.recommendations.
const RecommendServices = ({ cards }) => {
  return (
    <section className="mt-[5.3125rem]">
      <h2 className="text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
        추천 지원 서비스
      </h2>

      <div className="mt-[0.9375rem] grid grid-cols-2 gap-5">
        {cards.map((card) => (
          <div
            key={card.rank}
            className="h-[12.5625rem] w-[30.625rem] rounded-[0.75rem] border border-[#d1e8ff] pl-[0.8125rem] pt-4"
          >
            {/* 적합도 50 미만이라 추천 서비스가 하나도 없을 때(SVC_NONE 안내 카드)는 rank·name 이 비어
                제목 줄이 공백 한 칸만 렌더된다 — 빈 줄을 그리지 않고 안내 본문만 남긴다. */}
            {(card.rank || card.name) && (
              <h3 className="text-[1.1875rem] font-medium text-[#525252]">
                {[card.rank, card.name].filter(Boolean).join(' ')}
              </h3>
            )}
            <p className="mt-2 w-[28.8125rem] text-base font-normal leading-[1.3] text-[#808080]">
              {card.desc}
            </p>
            <div className="mt-[0.6875rem] flex flex-wrap gap-x-[1.375rem] gap-y-2">
              {card.chips.map((chip, index) => (
                <span
                  key={index}
                  className="inline-flex h-7 items-center justify-center rounded-[0.75rem] bg-[#f1f8ff] px-2 py-1 text-[0.875rem] font-normal text-[#1b5da0]"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default RecommendServices;
