// 추천 지원 서비스 카드 2장 — 490x201, border #d1e8ff, 순위 타이틀 + 본문 + 칩 4개.
// 칩은 StatusBadge(blue)와 동일 시각(bg #f1f8ff / text #1b5da0)이나 폰트 크기만 달라
// 로컬 span 으로 구현(props 계약: RecommendServices 내부 전용, StatusBadge 미의존).
// props: { cards } = [{ rank, name, desc, chips: string[4] }] x2 — data.recommendations.
// R3(2026-08-11) — 2열 고정 카드(490×201)는 모바일 1열 스택으로, 높이·본문 폭 고정도 제거해
// 실제 텍스트 줄 수만큼 카드가 늘어나게 한다(칩 줄바꿈으로 인한 세로 잘림 방지).
// leadNote(F-05 · F-06) — '왜 카드가 적은지'를 설명하는 조건부 안내(중3 / 고3 6월 이후).
// prop 이름을 serviceLimit 이 아니라 일반명 leadNote 로 둔 이유: 학년별 제한 안내가 두 자리로
// 갈라지지 않게 같은 슬롯을 계속 재사용하기 위해서다. 조건 판정은 엔진이 소유한다(buildNotices).
const RecommendServices = ({ cards, leadNote = null }) => {
  return (
    // fd-recommend-* — 인쇄 훅(BLOCK 수정). report-print.css 가 기존 lg: 리터럴과 동일한
    // 값으로 강제한다.
    <section className="fd-recommend-section mt-12 lg:mt-[5.3125rem]">
      <h2 className="text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
        추천 지원 서비스
      </h2>

      {/* 카드 **앞**이어야 기능한다 — 뒤에 있으면 '서비스가 부실하다'고 판단한 뒤에 읽힌다.
          인쇄 제외는 2페이지 flow 여유(52.6px) 보호 때문이며, PDF 에서도 카드 자체는 그대로다. */}
      {/* G-3(NIT 3) — 인쇄에서 display:none 인 화면 전용 문단이라 모바일 14px 를 유지할 이유가
          없다. 모바일 text-base(16px), 데스크톱만 기존 text-sm(14px) 유지. */}
      {leadNote && (
        <p className="fd-screen-only mt-3 w-full break-keep text-base leading-[1.45] text-[#6b6b6b] lg:w-[62.5rem] lg:text-sm">
          {leadNote}
        </p>
      )}

      <div className="fd-recommend-grid mt-4 grid grid-cols-1 gap-4 lg:mt-[0.9375rem] lg:grid-cols-2 lg:gap-5">
        {cards.map((card) => (
          <div
            key={card.rank}
            className="fd-recommend-card w-full rounded-[0.75rem] border border-[#d1e8ff] px-[0.8125rem] py-4 lg:h-[12.5625rem] lg:w-[30.625rem] lg:pl-[0.8125rem] lg:pr-0 lg:pt-4 lg:pb-0"
          >
            {/* 적합도 50 미만이라 추천 서비스가 하나도 없을 때(SVC_NONE 안내 카드)는 rank·name 이 비어
                제목 줄이 공백 한 칸만 렌더된다 — 빈 줄을 그리지 않고 안내 본문만 남긴다. */}
            {(card.rank || card.name) && (
              <h3 className="text-[1.1875rem] font-medium text-[#525252]">
                {[card.rank, card.name].filter(Boolean).join(" ")}
              </h3>
            )}
            <p className="fd-recommend-desc mt-2 w-full text-base font-normal leading-[1.3] text-[#808080] lg:w-[28.8125rem]">
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
