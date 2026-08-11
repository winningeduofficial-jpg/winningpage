// 텍스트 입력 필드 — docs/login-signup-renewal-spec.md §3.0/§3.3(C-1/D-2/E-1)/§5.1.
// 라벨(0.875rem/14px) + 입력(높이 3.25rem 기본/3.75rem variant, radius 0.75rem 고정 —
// 높이만 52/60px 두 계열이고 radius 12px는 시안 전 화면 공통) + 인풋 아래 우측 정렬 액션
// 링크 슬롯(예: "인증번호 보내기" — 인풋 풀폭 유지를 위해 입력 행이 아닌 하단 행에 배치,
// §시안 이탈 조정 T2) + 하단 헬퍼/에러/성공 3상태 메시지.
// active(border-primary)는 status(메시지 색)와 별개 개념이다 — C-1 에러 상태에서도
// 필드 테두리는 #d7d7d7 그대로 유지되는 반면, E-3(연결코드 인식) 같은 화면은 메시지 상태와
// 무관하게 테두리만 primary로 바뀐다. 그래서 border 강조는 별도 active prop으로 제어한다.
//
// 모션(impeccable animate): status가 'default'/'success'에서 'error'로 "전환되는 순간"에만
// 입력 행에 1회 shake를 준다(이미 error인 상태가 유지되며 메시지 텍스트만 바뀌는 경우는
// 재생하지 않음 — 매 렌더 반복 재생은 피로도를 유발). 헬퍼/에러/성공 메시지는 등장 시
// auth-message-enter로 살짝 페이드-라이즈한다. 두 클래스 모두 index.css에서
// prefers-reduced-motion: reduce 시 애니메이션이 꺼진다.
import { useEffect, useRef, useState } from 'react';

const SIZE_CLASSES = {
  default: 'h-[3.25rem] rounded-xl border-line px-5 text-base', // 52px, radius 12px, 텍스트 16px
  lg: 'h-[3.75rem] rounded-xl border-line px-5 text-base', // 60px, radius 12px, 텍스트 16px
  // 인앱(수행평가) 폼 전용 — docs/수행평가-상세-명세.md §5.5/§7.3 실측(3754:3206).
  // 높이 2.5rem(40)·radius 0.5rem(8)·텍스트 0.875rem(14)·보더 performance-line(#d9d9d9,
  // 전역 line #d7d7d7과 다른 값)·배경 performance-bubble(#f8f7f5). default/lg와 별개 계열이므로
  // 여기 값만 바꿔도 기존 회원가입/로그인 폼(52·60px 계열)에는 영향 없다.
  perf: 'h-[2.5rem] rounded-lg border-performance-line bg-performance-bubble px-4 text-sm'
};

const STATUS_TEXT_CLASSES = {
  default: 'text-ink-sub', // 회색 헬퍼
  error: 'text-error', // 빨강
  success: 'text-accent' // 파랑(유효)
};

export default function TextField({
  label,
  id,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  size = 'default', // 'default' | 'lg' | 'perf'(인앱 2.5rem/40px)
  active = false, // true면 border-primary(예: E-3 코드 인식 상태)
  actionLabel, // 우측 액션 링크 텍스트(예: '인증번호 보내기' / '인증번호 다시 보내기')
  onAction,
  actionDisabled = false,
  helperText,
  status = 'default', // 'default' | 'error' | 'success'
  disabled = false,
  readOnly = false,
  autoComplete,
  // 연결코드처럼 대문자 영숫자만 받는 필드용. 모바일 자동 대문자화와 맞춤법
  // 밑줄이 오히려 방해가 되는 경우가 있어 호출부가 끌 수 있게 둔다.
  autoCapitalize,
  spellCheck,
  required = false,
  className = ''
}) {
  const fieldId = id || name;
  const [shake, setShake] = useState(false);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (status === 'error' && prevStatusRef.current !== 'error') {
      setShake(true);
      const timer = window.setTimeout(() => setShake(false), 320);
      prevStatusRef.current = status;
      return () => window.clearTimeout(timer);
    }

    prevStatusRef.current = status;
  }, [status]);

  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="mb-2 block text-[0.875rem] font-medium text-ink">
          {label}
        </label>
      )}

      <input
        id={fieldId}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        spellCheck={spellCheck}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-describedby={helperText ? `${fieldId}-helper` : undefined}
        aria-invalid={status === 'error'}
        className={`w-full border text-ink outline-none transition placeholder:text-ink-sub focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-footer ${SIZE_CLASSES[size] || SIZE_CLASSES.default} ${active ? 'border-primary' : ''} ${shake ? 'auth-field-shake' : ''}`}
      />

      {actionLabel && (
        // 인풋 풀폭 유지를 위해 액션 링크를 입력 행이 아닌 하단 우측 정렬 행으로 배치
        // (시안 §3.3 C-1/D-2/E-1 공통: 인풋은 항상 풀폭, 액션은 인풋 아래 우측).
        // 터치 히트영역 확장은 TextLinkButton과 동일한 px-1 py-2 -mx-1 -my-2 관례를 따른다.
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className="inline-flex items-center px-1 py-2 -mx-1 -my-2 whitespace-nowrap text-xs font-normal text-ink underline underline-offset-2 disabled:cursor-not-allowed disabled:text-line"
          >
            {actionLabel}
          </button>
        </div>
      )}

      {helperText && (
        <p
          id={`${fieldId}-helper`}
          role="status"
          className={`auth-message-enter mt-2 break-keep text-xs ${STATUS_TEXT_CLASSES[status] || STATUS_TEXT_CLASSES.default}`}
        >
          {helperText}
        </p>
      )}
    </div>
  );
}
