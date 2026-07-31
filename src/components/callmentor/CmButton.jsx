import { Link } from 'react-router-dom';

/**
 * 콜멘토 랜딩 전용 버튼 (docs/callmentor-spec.md 5.1.5 `CmButton`).
 * 300×68(=18.75rem×4.25rem) / radius 20 / padding 24-60 / 라벨 20px 공통 스펙을
 * Hero 2종 + 하단 CTA 1종이 공유한다. 모바일은 시안에 없어 전폭(w-full)으로 러프 적응.
 *
 * @param {object} props
 * @param {'primary'|'outline'|'white'} [props.variant='primary']
 * @param {string} [props.to] react-router 내부 경로 (있으면 Link로 렌더)
 * @param {string} [props.href] 외부/앵커 경로 (to가 없고 href가 있으면 <a>로 렌더)
 * @param {() => void} [props.onClick]
 * @param {string} [props.className] 라벨 weight 등 변형용 추가 클래스
 */
const VARIANT_CLASSES = {
  primary: 'bg-[#013262] text-white hover:bg-[#012A52]',
  outline: 'border border-[#0F172A] bg-transparent text-[#0F172A] hover:bg-[#0F172A]/[0.04]',
  white: 'bg-white text-[#525252] hover:bg-[#F4F4F6]'
};

export default function CmButton({
  variant = 'primary',
  to,
  href,
  onClick,
  children,
  className = ''
}) {
  const classes = `inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-[1.25rem] px-[3.75rem] py-[1.5rem] text-[1.25rem] leading-[1.25rem] font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#013262] sm:w-auto ${VARIANT_CLASSES[variant]} ${className}`;

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
