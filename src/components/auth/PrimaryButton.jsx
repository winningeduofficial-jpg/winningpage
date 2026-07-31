// 활성/비활성 상태 기반 주 CTA 버튼 — docs/login-signup-renewal-spec.md §3.0/§5.1/§5.4.
// 활성 bg-primary / 비활성 bg-line(비활성 텍스트는 surface-footer — 시안 D-2 "다음" 버튼
// 비활성 상태 스펙: 배경 #d7d7d7·텍스트 #f9fafb). 높이 3.25rem/3.75rem, radius 0.75rem/0.875rem
// variant를 독립적으로 조합할 수 있게 한다(시안 자체가 52+12 / 60+14 조합만 쓰지만 D-1처럼
// 52px+16px 텍스트, 60px+20px 텍스트 등 높이별 텍스트 크기도 함께 바뀌므로 size에 텍스트
// 크기까지 묶어 둔다).
//
// 모션(impeccable animate): active:scale로 눌림 피드백(transform만 사용, prefers-reduced-motion
// 시 motion-reduce:active:scale-100로 무력화), loading prop으로 스피너(Loader2 animate-spin)를
// 더할 수 있다 — 기본 false라 기존 호출부는 영향 없다. 비활성(bg-line)과 처리중(bg-primary/80)은
// 시각적으로 구분한다(처리중은 유효한 제출이 진행 중임을, 비활성은 아직 제출 불가임을 뜻함).
import { Loader2 } from 'lucide-react';

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
  loading = false, // true면 좌측에 스피너를 더하고 처리중 톤(bg-primary/80)으로 표시
  size = 'default', // 'default' | 'lg'
  radius = 'default', // 'default' | 'lg'
  fullWidth = true,
  className = ''
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`flex items-center justify-center gap-2 font-semibold transition active:scale-[0.97] motion-reduce:active:scale-100 ${
        fullWidth ? 'w-full' : ''
      } ${SIZE_CLASSES[size] || SIZE_CLASSES.default} ${RADIUS_CLASSES[radius] || RADIUS_CLASSES.default} ${
        isDisabled
          ? loading
            ? 'cursor-progress bg-primary/80 text-white'
            : 'cursor-not-allowed bg-line text-white'
          : 'bg-primary text-white hover:bg-primary/90'
      } ${className}`}
    >
      {loading && (
        <Loader2 size={18} strokeWidth={2.5} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
