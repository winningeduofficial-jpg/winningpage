// 아웃라인(보더+투명 배경) 버튼 — docs/login-signup-renewal-spec.md §3.3(E-4/E-7/E-8)/§5.1.
// 시안 내 아웃라인 버튼 색이 화면마다 다르다: E-7/E-8 "홈으로 가기"는 border-primary(#013262),
// E-4 "홈으로 가기"는 카드형 border-line(#d7d7d7)+text-ink(#525252) — 두 변형을 tone prop으로
// 구분한다(§6.3 R5: 시안 자체의 불일치이므로 화면 구현 시 어느 쪽인지 이 계약을 기준으로 선택).
const TONE_CLASSES = {
  primary: 'border-primary text-primary hover:bg-primary/5', // E-7/E-8
  muted: 'border-line text-ink hover:bg-surface-card' // E-4 카드형
};

const SIZE_CLASSES = {
  default: 'h-[3.25rem] text-base', // 52px
  lg: 'h-[3.75rem] text-xl' // 60px
};

const RADIUS_CLASSES = {
  default: 'rounded-xl', // 0.75rem(12px)
  lg: 'rounded-[0.875rem]', // 14px
  xl: 'rounded-2xl' // 1rem(16px) — E-4 카드형
};

export default function OutlineButton({
  children,
  type = 'button',
  onClick,
  disabled = false,
  tone = 'primary', // 'primary' | 'muted'
  size = 'default', // 'default' | 'lg'
  radius = 'default', // 'default' | 'lg' | 'xl'
  fullWidth = true,
  className = ''
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center border bg-white font-semibold transition active:scale-[0.97] motion-reduce:active:scale-100 ${
        fullWidth ? 'w-full' : ''
      } ${SIZE_CLASSES[size] || SIZE_CLASSES.default} ${RADIUS_CLASSES[radius] || RADIUS_CLASSES.default} ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      } ${TONE_CLASSES[tone] || TONE_CLASSES.primary} ${className}`}
    >
      {children}
    </button>
  );
}
