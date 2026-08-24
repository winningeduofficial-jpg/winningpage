import {
  PREMIUM_BEIGE_BG_CLASS,
  PREMIUM_CARD_BORDER_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
} from "./premiumTokens";

// 넘버드 카드 그리드 — PremiumAreaCards 와 같은 시각 언어(골드 번호 + 밑줄 + 본문)를 쓰되
// 불릿 목록 대신 단일 설명 문단을 받고, 카드 1개를 베이지 틴트로 강조할 수 있다(시안: 서비스
// 3카드 가운데 카드, 동시합격 4카드 두번째 카드). 헤딩은 섹션마다 배치가 달라(중앙 vs
// 좌측제목+우측설명) 이 컴포넌트에 포함하지 않고 페이지가 감싼다.
//
// tone="dark"(해외명문대 6단계 시안 전용) — 개별 카드 배경/보더 대신 3열×N행 그리드에
// 얇은 구분선(border)만 두르고, 텍스트를 흰색/골드로 반전한다. 3열 고정 전제라 columns
// 상수를 그대로 쓴다(다른 개수로 쓰게 되면 일반화 필요 — 지금은 6개 단일 용도).
type NumberedCardItem = {
  number: string;
  title: string;
  description: string;
  highlighted?: boolean;
};

type PremiumNumberedCardsProps = {
  items: NumberedCardItem[];
  tone?: "light" | "dark";
};

const DARK_GRID_COLUMNS = 3;

export default function PremiumNumberedCards({
  items,
  tone = "light",
}: PremiumNumberedCardsProps) {
  if (!items || items.length === 0) return null;

  if (tone === "dark") {
    const rows = Math.ceil(items.length / DARK_GRID_COLUMNS);

    return (
      <div className="grid grid-cols-1 border border-white/15 sm:grid-cols-3">
        {items.map((item, index) => {
          const row = Math.floor(index / DARK_GRID_COLUMNS);
          const isLastColumn =
            (index + 1) % DARK_GRID_COLUMNS === 0 || index === items.length - 1;
          const isLastRow = row === rows - 1;

          // 다크 셀은 다크→다크 배경 전환이 의미 없어 PremiumAreaCards의 hover:bg-ink-dark
          // 반전 대신 흰 오버레이로 살짝 밝히는 방식으로 반전한다(hover:bg-white/5 는
          // 임의값이 아닌 표준 opacity 유틸이라 Tailwind 스캔 제약과 무관). 셀끼리 보더를
          // 공유하므로 scale 시 이웃 셀 위로 뜨도록 relative+hover:z-10을 둔다.
          return (
            <div
              key={item.number}
              className={`group relative flex flex-col px-6 py-7 transition-[background-color,box-shadow,transform] duration-200 hover:z-10 hover:scale-[1.03] hover:bg-white/5 hover:shadow-[0_0.5rem_1.75rem_rgba(0,0,0,0.45)] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:px-8 ${
                isLastRow ? "" : "border-b border-white/15"
              } ${isLastColumn ? "" : "sm:border-r sm:border-white/15"}`}
            >
              <span
                className={`text-[1.5rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
              >
                {item.number}
              </span>
              <p className="mt-2 break-keep text-[1rem] font-semibold leading-[1.4] text-white">
                {item.title}
              </p>
              <span
                className="mt-3 h-[0.09375rem] w-8 bg-gold opacity-60 transition-opacity duration-200 group-hover:opacity-100"
                aria-hidden="true"
              />
              <p className="mt-4 break-keep text-[0.875rem] leading-[1.6] text-white/70">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  // hover:bg-ink-dark 는 PREMIUM_DARK_BG_CLASS(bg-ink-dark)와 같은 토큰이지만 리터럴로 둔다 —
  // Tailwind 는 `hover:${상수}` 같은 런타임 조합을 스캔하지 못해 클래스가 생성되지 않는다.
  // highlighted(베이지 틴트) 카드도 같은 hover 반전을 그대로 적용해 호버 동작을 일관되게 둔다.
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-row">
      {items.map((item) => (
        <div
          key={item.number}
          className={`group flex min-h-[12rem] w-full shrink-0 flex-col rounded-lg px-8 py-7 transition-[background-color,color,transform,box-shadow] duration-200 hover:scale-[1.03] hover:border-transparent hover:shadow-[0_0.5rem_1.75rem_rgba(28,26,25,0.28)] hover:bg-ink-dark hover:text-white motion-reduce:transition-none motion-reduce:hover:scale-100 lg:flex-1 ${
            item.highlighted
              ? `border border-transparent ${PREMIUM_BEIGE_BG_CLASS}`
              : PREMIUM_CARD_BORDER_CLASS
          }`}
        >
          <span
            className={`text-[1.5rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS} group-hover:text-white`}
          >
            {item.number}
          </span>
          <p className="mt-2 break-keep text-[1rem] font-semibold leading-[1.4] text-ink-strong group-hover:text-white">
            {item.title}
          </p>
          <span
            className="mt-3 h-[0.09375rem] w-8 bg-gold opacity-60"
            aria-hidden="true"
          />
          <p
            className={`mt-4 break-keep text-[0.875rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS} group-hover:font-semibold group-hover:text-white`}
          >
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}
