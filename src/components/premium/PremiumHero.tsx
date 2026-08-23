import type { ReactNode } from "react";
import { Link } from "react-router";

// §1 히어로 — 풀폭 배경사진(hero-bg.webp) 위 중앙 텍스트 블록.
//
// 가독성 장치는 시안의 hero-glow.svg(흰→투명 타원, 가장자리가 너무 묽어 본문 2행이 사진
// 어두운 영역에 걸치면 읽히지 않았음) 대신 CSS 방사형 라이트로 교체했다. 텍스트 블록
// 범위는 흰색 불투명도 0.4~0.46 으로 아주 옅게 밝히고(사진 질감이 비치도록), 넓은 반경으로 완만히
// 투명해져 사진의 손·연필·종이 디테일이 그대로 보인다. 어두운 텍스트(ink-strong/ink)는
// 그대로 — 라이트 위에서 AA 대비 확보.
type PremiumHeroProps = {
  title: ReactNode;
  description: ReactNode;
  cta: { label: string; to: string };
  bgSrc: string;
};

export default function PremiumHero({
  title,
  description,
  cta,
  bgSrc,
}: PremiumHeroProps) {
  return (
    <section className="relative flex h-[28rem] w-full items-center justify-center overflow-hidden sm:h-[36rem] lg:h-[46.9375rem]">
      <img
        src={bgSrc}
        alt=""
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* 방사형 라이트 — 텍스트 블록(최대 38.8rem)보다 넉넉한 타원, 모바일은 폭 대비 더 크게 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[160%] w-[260%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.46)_0%,rgba(255,255,255,0.4)_40%,rgba(255,255,255,0.18)_66%,rgba(255,255,255,0)_88%)] sm:w-[180%] lg:h-[200%] lg:w-[130%]"
      />
      <div className="relative z-10 mx-auto w-full max-w-[38.8125rem] px-5 text-center sm:px-8">
        <h1 className="break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[2rem]">
          {title}
        </h1>
        <p className="mt-4 break-keep text-[1rem] font-medium leading-[1.6] text-ink-strong sm:text-[1.25rem] lg:text-[1.5rem]">
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
