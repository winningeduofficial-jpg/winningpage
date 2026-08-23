import type { ReactNode } from "react";
import { Link } from "react-router";

// §10 하단 S 프로그램 CTA 배너 — 풀폭 이미지 배경 + 어두운 오버레이 + 중앙 흰 텍스트 +
// 텍스트 링크. 높이 493px(=30.8125rem, 시안 실측).
type PremiumCtaBannerProps = {
  title: ReactNode;
  cta: { label: string; to: string };
  /** public/images/premium/cta-s-program-bg.webp — 페이지가 명시적으로 넘긴다. */
  bgSrc: string;
};

export default function PremiumCtaBanner({
  title,
  cta,
  bgSrc,
}: PremiumCtaBannerProps) {
  return (
    <section className="relative flex h-[30.8125rem] w-full items-center justify-center overflow-hidden px-5">
      <img
        src={bgSrc}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <h2 className="break-keep text-[2rem] font-semibold leading-[1.4] text-white">
          {title}
        </h2>
        <Link
          to={cta.to}
          className="text-[1.25rem] font-medium leading-[1.4] text-white underline-offset-4 hover:underline rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          {cta.label}
        </Link>
      </div>
    </section>
  );
}
