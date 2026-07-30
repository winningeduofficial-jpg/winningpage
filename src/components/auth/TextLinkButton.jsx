// 배경/보더 없는 텍스트 버튼·링크 — docs/login-signup-renewal-spec.md §3.3(전 화면)/§5.1.
// 용례가 넓다: "회원가입"(하단 안내, 16px semibold primary), "+ 자녀 추가하기"(16px semibold
// primary), "건너뛰기"(20px medium line — 접근성 대비 미달 우려는 §6.3 R7에 기록됨,
// 색 교체는 디자이너 컨펌 후 tone prop만 바꾸면 됨), "코드 복사하기"(12px underline accent).
// as='link'면 react-router Link로 렌더(내부 이동), as='button'이면 버튼(클릭 핸들러만 필요한
// 액션, 예: 코드 복사)으로 렌더한다.
import { Link } from 'react-router-dom';

const TONE_CLASSES = {
  primary: 'text-primary',
  accent: 'text-accent',
  ink: 'text-ink',
  muted: 'text-line'
};

const SIZE_CLASSES = {
  xs: 'text-xs', // 12px — 인증번호 보내기, 코드 복사하기
  sm: 'text-sm', // 14px
  md: 'text-base', // 16px — + 자녀 추가하기, 회원가입 링크
  lg: 'text-xl' // 20px — 건너뛰기
};

const WEIGHT_CLASSES = {
  medium: 'font-medium',
  semibold: 'font-semibold'
};

export default function TextLinkButton({
  children,
  as = 'button', // 'button' | 'link'
  to,
  type = 'button',
  onClick,
  disabled = false,
  tone = 'primary', // 'primary' | 'accent' | 'ink' | 'muted'
  size = 'md', // 'xs' | 'sm' | 'md' | 'lg'
  weight = 'semibold', // 'medium' | 'semibold'
  underline = false,
  className = ''
}) {
  const classes = `inline-flex items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
    TONE_CLASSES[tone] || TONE_CLASSES.primary
  } ${SIZE_CLASSES[size] || SIZE_CLASSES.md} ${WEIGHT_CLASSES[weight] || WEIGHT_CLASSES.semibold} ${
    underline ? 'underline underline-offset-2' : ''
  } ${className}`;

  if (as === 'link') {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}
