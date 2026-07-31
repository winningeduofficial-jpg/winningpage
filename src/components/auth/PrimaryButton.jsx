// 활성/비활성 상태 기반 주 CTA 버튼 — docs/login-signup-renewal-spec.md §3.0/§5.1/§5.4.
// 활성 bg-primary / 비활성 bg-line(비활성 텍스트는 surface-footer — 시안 D-2 "다음" 버튼
// 비활성 상태 스펙: 배경 #d7d7d7·텍스트 #f9fafb). 높이 3.25rem/3.75rem, radius 0.75rem/0.875rem
// variant를 독립적으로 조합할 수 있게 한다(시안 자체가 52+12 / 60+14 조합만 쓰지만 D-1처럼
// 52px+16px 텍스트, 60px+20px 텍스트 등 높이별 텍스트 크기도 함께 바뀌므로 size에 텍스트
// 크기까지 묶어 둔다).
const SIZE_CLASSES = {
  default: 'h-[3.25rem] text-base', // 52px, 16px
  lg: 'h-[3.75rem] text-xl' // 60px, 20px
};

const RADIUS_CLASSES = {
  default: 'rounded-xl', // 0.75rem(12px)
  lg: 'rounded-[0.875rem]' // 14px
};

export default function PrimaryButton({
  children,
  type = 'button',
  onClick,
  disabled = false,
  size = 'default', // 'default' | 'lg'
  radius = 'default', // 'default' | 'lg'
  fullWidth = true,
  className = ''
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center font-semibold transition ${
        fullWidth ? 'w-full' : ''
      } ${SIZE_CLASSES[size] || SIZE_CLASSES.default} ${RADIUS_CLASSES[radius] || RADIUS_CLASSES.default} ${
        disabled
          ? 'cursor-not-allowed bg-line text-white'
          : 'bg-primary text-white hover:bg-primary/90'
      } ${className}`}
    >
      {children}
    </button>
  );
}
