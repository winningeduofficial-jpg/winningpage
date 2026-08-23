import type { ReactNode } from "react";
import { Link } from "react-router";

// §1 히어로 — 풀폭 배경사진(hero-bg.webp) + 중앙 밝은 타원 글로우(hero-glow.svg) +
// 중앙 텍스트 박스. glowSrc 는 흰색→투명 방사형 그라디언트라(에셋 실측) 그 위에 얹는
// 타이틀/서브는 흰 글씨가 아니라 ink-strong/ink 어두운 톤을 쓴다 — 배경 사진이 전체적으로
// 어두워 글로우가 없으면 어떤 텍스트색도 대비가 안 나오고, 글로우 위에서는 어두운 텍스트가
// 시안 의도(원장 사진 위 밝은 halo)와 맞다.
type PremiumHeroProps = {
  title: ReactNode;
  description: ReactNode;
  cta: { label: string; to: string };
  bgSrc: string;
  glowSrc?: string;
};

export default function PremiumHero({
  title,
  description,
  cta,
  bgSrc,
  glowSrc,
}: PremiumHeroProps) {
  return (
    <section className="relative flex h-[28rem] w-full items-center justify-center overflow-hidden sm:h-[36rem] lg:h-[46.9375rem]">
      <img
        src={bgSrc}
        alt=""
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {glowSrc ? (
        <img
          src={glowSrc}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-[240%] max-w-none -translate-x-1/2 -translate-y-1/2 sm:w-[150%] lg:w-[90%] lg:max-w-[51.75rem]"
        />
      ) : null}
      <div className="relative z-10 mx-auto w-full max-w-[38.8125rem] px-5 text-center sm:px-8">
        <h1 className="break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[2rem]">
          {title}
        </h1>
        <p className="mt-4 break-keep text-[1rem] font-medium leading-[1.5] text-ink sm:text-[1.25rem] lg:text-[1.5rem]">
          {description}
        </p>
        <Link
          to={cta.to}
          className="mt-8 inline-flex items-center justify-center rounded-full bg-ink-strong px-[3.75rem] py-[1.5rem] text-[1.25rem] font-medium text-white transition-colors hover:bg-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          {cta.label}
        </Link>
      </div>
    </section>
  );
}
