import type { ReactNode } from "react";
import { Link } from "react-router";
import { PREMIUM_SECTION_PADDING_CLASS } from "./premiumTokens";

// §10 하단 CTA 배너 — 기본(A 페이지, S 프로그램 안내): 풀폭 이미지 배경 + 어두운 오버레이 +
// 중앙 흰 텍스트 + 텍스트 링크. 높이 493px(=30.8125rem, 시안 실측).
// variant="light" (S 페이지, A 프로그램 안내): 사진 없음, 베이지 배경, 검정 헤딩,
// 골드 pill 버튼. bgSrc 는 light 에서는 사용하지 않는다.
// sub / secondaryCta — 대학원입학 시안: 채움 버튼("이용 신청하기") + 아웃라인 버튼(tel: 전화상담)
// 2개 구성. 둘 다 옵셔널이라 기존 단일 CTA 사용처(A/S 페이지)는 렌더 결과가 그대로다.
type PremiumCtaBannerProps = {
  title: ReactNode;
  sub?: ReactNode;
  cta: { label: string; to: string };
  secondaryCta?: { label: string; href: string };
  /** public/images/premium/cta-s-program-bg.webp — 페이지가 명시적으로 넘긴다. variant="light" 에선 불필요. */
  bgSrc?: string;
  /** light: 베이지 배경+골드 pill(S→A 안내). plain: 흰 배경+텍스트 링크(시안 S 하단 첫 배너). */
  variant?: "light" | "plain";
};

export default function PremiumCtaBanner({
  title,
  sub,
  cta,
  secondaryCta,
  bgSrc,
  variant,
}: PremiumCtaBannerProps) {
  if (variant === "plain") {
    return (
      <section
        className={`flex w-full items-center justify-center bg-white px-5 ${PREMIUM_SECTION_PADDING_CLASS}`}
      >
        <div className="flex flex-col items-center gap-8 text-center">
          <h2 className="break-keep text-[2rem] font-semibold leading-[1.4] text-ink-strong">
            {title}
          </h2>
          <Link
            to={cta.to}
            className="rounded-sm text-[1.25rem] font-medium leading-[1.4] text-ink-strong underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {cta.label}
          </Link>
        </div>
      </section>
    );
  }

  if (variant === "light") {
    return (
      <section
        className={`flex w-full items-center justify-center bg-surface-beige px-5 ${PREMIUM_SECTION_PADDING_CLASS}`}
      >
        <div className="flex flex-col items-center gap-8 text-center">
          <div>
            <h2 className="break-keep text-[2rem] font-semibold leading-[1.4] text-ink-strong">
              {title}
            </h2>
            {sub ? (
              <p className="mt-3 break-keep text-[1rem] font-medium leading-[1.5] text-ink">
                {sub}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to={cta.to}
              className="rounded-full bg-gold px-[3.75rem] py-[1.5rem] text-[1.25rem] font-semibold leading-[1.4] text-ink-strong transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              {cta.label}
            </Link>
            {secondaryCta ? (
              <a
                href={secondaryCta.href}
                className="rounded-full border border-line bg-white px-10 py-[1.5rem] text-[1.25rem] font-semibold leading-[1.4] text-ink-strong transition hover:bg-surface-footer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                {secondaryCta.label}
              </a>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex h-[30.8125rem] w-full items-center justify-center overflow-hidden px-5">
      {bgSrc ? (
        <img
          src={bgSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
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
