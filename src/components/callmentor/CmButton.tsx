import type { ReactNode } from "react";
import { Link } from "react-router";

/**
 * 콜멘토 랜딩 전용 버튼.
 * 시안 300×68(=18.75rem×4.25rem) / radius 20 / padding 24·60 을, 실제 콘텐츠 가용 폭
 * 1100px 기준 배율 0.764(1100/1440, ServiceTestimonials.jsx 의 radius 40→30.6px 주석과
 * 동일 근거)로 보정해 radius 15 / padding 18·46 을 쓴다. 라벨 20px 은 폰트 1:1 규약에
 * 따라 보정하지 않는다. Hero 2종 + 하단 CTA 1종이 공유한다. 모바일은 시안에 없어
 * 전폭(w-full)으로 러프 적응.
 */
// focus-visible:outline-solid 색은 variant 가 각자 소유한다(공통 문자열에는 두지 않는다).
// white variant 는 §7 검정 밴드 위에서만 쓰이는데 #013262 링은 #000 대비 1.5:1 로
// 사실상 보이지 않아(순수 a11y 결함) 골드 #AF9364 로 바꾼다. primary/outline 은 무변경.
const VARIANT_CLASSES = {
  primary:
    "bg-primary text-white hover:bg-[#012A52] focus-visible:outline-primary",
  outline:
    "border border-[#0F172A] bg-transparent text-[#0F172A] hover:bg-[#0F172A]/4 focus-visible:outline-primary",
  white: "bg-white text-ink hover:bg-[#F4F4F6] focus-visible:outline-gold",
};

type CmButtonProps = {
  variant?: keyof typeof VARIANT_CLASSES;
  /** react-router 내부 경로 (있으면 Link로 렌더) */
  to?: string;
  /** 외부/앵커 경로 (to가 없고 href가 있으면 <a>로 렌더) */
  href?: string;
  onClick?: () => void;
  children?: ReactNode;
  /** 라벨 weight 등 변형용 추가 클래스 */
  className?: string;
};

export default function CmButton({
  variant = "primary",
  to,
  href,
  onClick,
  children,
  className = "",
}: CmButtonProps) {
  const classes = `inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-[0.9375rem] px-11.5 py-4.5 text-[1.25rem] leading-5 font-medium transition-colors duration-150 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto ${VARIANT_CLASSES[variant]} ${className}`;

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} onClick={onClick} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
