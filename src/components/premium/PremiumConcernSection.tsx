import type { ReactNode } from "react";
import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_SECTION_BG_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_SECTION_HEADING_DARK_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// "국제학교 학부모님의 깊어져만 가는 고민" 섹션(해외명문대 진학컨설팅 전용, 다크 네이비 bg —
// 시안 실측 #191d23는 기존 PREMIUM_DARK_SECTION_BG_CLASS(ink-strong)와 동일해 별도 토큰을
// 새로 추가하지 않는다). 흰 카드 2×2 → 강조 pill(gold 구간 포함) → 세로 연결선 → 번호
// 스텝 2개(01/02, "+"로 연결) 순서로 고정된 전용 레이아웃이라 범용화하지 않는다.
type ConcernCard = {
  label: string;
  description: string;
};

type ConcernStep = {
  number: string;
  text: string;
};

type PremiumConcernSectionProps = {
  heading: ReactNode;
  cards: ConcernCard[];
  /** 강조 pill 본문. goldPhrase가 있으면 그 부분만 별도로 감싸 gold 색을 입힌다. */
  pillText: string;
  goldPhrase: string;
  steps: [ConcernStep, ConcernStep];
};

export default function PremiumConcernSection({
  heading,
  cards,
  pillText,
  goldPhrase,
  steps,
}: PremiumConcernSectionProps) {
  if (!cards || cards.length === 0) return null;

  const goldIndex = pillText.indexOf(goldPhrase);
  const pillBefore = goldIndex >= 0 ? pillText.slice(0, goldIndex) : pillText;
  const pillAfter =
    goldIndex >= 0 ? pillText.slice(goldIndex + goldPhrase.length) : "";

  return (
    <section
      className={`${PREMIUM_DARK_SECTION_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
    >
      <div className={PREMIUM_CONTAINER_CLASS}>
        <h2 className={PREMIUM_SECTION_HEADING_DARK_CLASS}>{heading}</h2>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-14 sm:grid-cols-2">
          {cards.map((card) => (
            <div
              key={card.label}
              className="flex flex-col gap-3 rounded-lg bg-white px-6 py-6 sm:px-8 sm:py-7"
            >
              <p className="break-keep text-[1rem] font-semibold leading-[1.4] text-ink-strong">
                {card.label}
              </p>
              <p className="break-keep text-[0.875rem] leading-[1.6] text-ink">
                {card.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg bg-white px-6 py-5 text-center sm:px-8">
          <p className="break-keep text-[0.9375rem] font-medium leading-[1.5] text-ink-strong sm:text-[1rem]">
            {pillBefore}
            {goldIndex >= 0 ? (
              <span className={PREMIUM_GOLD_TEXT_CLASS}>{goldPhrase}</span>
            ) : null}
            {pillAfter}
          </p>
        </div>

        <div className="mt-2 flex flex-col items-center">
          <span aria-hidden="true" className="h-10 w-px bg-white/25 sm:h-14" />
          {steps.map((step, index) => (
            <div key={step.number} className="flex flex-col items-center">
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="my-2 text-[1.125rem] font-medium text-white/60"
                >
                  +
                </span>
              ) : null}
              <span className="inline-flex size-8 items-center justify-center rounded-full border border-white/30 text-[0.875rem] font-medium text-white">
                {step.number}
              </span>
              <p className="mt-3 break-keep text-center text-[1rem] font-medium leading-[1.5] text-white sm:text-[1.125rem]">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
