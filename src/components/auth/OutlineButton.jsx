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

// 라벨 굵기는 **반드시 이 prop으로 고른다.** `className`으로 덮으려 하면 조용히 실패한다:
// 이 저장소는 tailwind-merge/clsx를 쓰지 않고(package.json에 없음), Tailwind v3는
// fontWeight 유틸을 theme 순서(… medium → semibold …)로 방출하므로 스타일시트 뒤쪽의
// `.font-semibold`가 이긴다 — class 속성 안의 순서는 무관하다.
// 시안 근거: 수행평가 STEP2 secondary `안내문 없이 시작하기`가 w500이다
// (docs/수행평가-상세-명세.md §5.6 표 「라벨 1rem w500 #808080」, 슬라이스 `3754:3261`
// `[Pretendard 500 16px/20]`). 나머지 호출부는 기존 그대로 w600이라 기본값이 semibold다.
const WEIGHT_CLASSES = {
  semibold: 'font-semibold',
  medium: 'font-medium'
};

export default function OutlineButton({
  children,
  type = 'button',
  onClick,
  disabled = false,
  tone = 'primary', // 'primary' | 'muted'
  size = 'default', // 'default' | 'lg'
  radius = 'default', // 'default' | 'lg' | 'xl'
  weight = 'semibold', // 'semibold' | 'medium'
  fullWidth = true,
  className = ''
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center border bg-white transition active:scale-[0.97] motion-reduce:active:scale-100 ${
        WEIGHT_CLASSES[weight] || WEIGHT_CLASSES.semibold
      } ${fullWidth ? 'w-full' : ''} ${SIZE_CLASSES[size] || SIZE_CLASSES.default} ${
        RADIUS_CLASSES[radius] || RADIUS_CLASSES.default
      } ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      } ${TONE_CLASSES[tone] || TONE_CLASSES.primary} ${className}`}
    >
      {children}
    </button>
  );
}
