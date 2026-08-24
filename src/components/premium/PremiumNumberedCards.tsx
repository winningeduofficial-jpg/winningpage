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
type NumberedCardItem = {
  number: string;
  title: string;
  description: string;
  highlighted?: boolean;
};

type PremiumNumberedCardsProps = {
  items: NumberedCardItem[];
};

export default function PremiumNumberedCards({
  items,
}: PremiumNumberedCardsProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-row">
      {items.map((item) => (
        <div
          key={item.number}
          className={`flex min-h-[12rem] w-full shrink-0 flex-col rounded-lg px-8 py-7 lg:flex-1 ${
            item.highlighted
              ? `border border-transparent ${PREMIUM_BEIGE_BG_CLASS}`
              : PREMIUM_CARD_BORDER_CLASS
          }`}
        >
          <span
            className={`text-[1.5rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
          >
            {item.number}
          </span>
          <p className="mt-2 break-keep text-[1rem] font-semibold leading-[1.4] text-ink-strong">
            {item.title}
          </p>
          <span
            className="mt-3 h-[0.09375rem] w-8 bg-gold opacity-60"
            aria-hidden="true"
          />
          <p
            className={`mt-4 break-keep text-[0.875rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS}`}
          >
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}
