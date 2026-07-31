// 텍스트 입력 필드 — docs/login-signup-renewal-spec.md §3.0/§3.3(C-1/D-2/E-1)/§5.1.
// 라벨(0.875rem/14px) + 입력(높이 3.25rem 기본/3.75rem variant, radius 0.75rem 고정 —
// 높이만 52/60px 두 계열이고 radius 12px는 시안 전 화면 공통) + 우측 액션 링크 슬롯
// (예: "인증번호 보내기") + 하단 헬퍼/에러/성공 3상태 메시지.
// active(border-primary)는 status(메시지 색)와 별개 개념이다 — C-1 에러 상태에서도
// 필드 테두리는 #d7d7d7 그대로 유지되는 반면, E-3(연결코드 인식) 같은 화면은 메시지 상태와
// 무관하게 테두리만 primary로 바뀐다. 그래서 border 강조는 별도 active prop으로 제어한다.
const SIZE_CLASSES = {
  default: 'h-[3.25rem]', // 52px
  lg: 'h-[3.75rem]' // 60px
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
  size = 'default', // 'default' | 'lg'
  active = false, // true면 border-primary(예: E-3 코드 인식 상태)
  actionLabel, // 우측 액션 링크 텍스트(예: '인증번호 보내기' / '인증번호 다시 보내기')
  onAction,
  actionDisabled = false,
  helperText,
  status = 'default', // 'default' | 'error' | 'success'
  disabled = false,
  readOnly = false,
  autoComplete,
  required = false,
  className = ''
}) {
  const fieldId = id || name;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="mb-2 block text-[0.875rem] font-medium text-ink">
          {label}
        </label>
      )}

      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-describedby={helperText ? `${fieldId}-helper` : undefined}
          aria-invalid={status === 'error'}
          className={`w-full flex-1 rounded-xl border border-line px-5 text-base text-ink outline-none transition placeholder:text-ink-sub focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-footer ${SIZE_CLASSES[size] || SIZE_CLASSES.default} ${active ? 'border-primary' : ''}`}
        />

        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className="shrink-0 whitespace-nowrap text-xs font-normal text-ink underline underline-offset-2 disabled:cursor-not-allowed disabled:text-line"
          >
            {actionLabel}
          </button>
        )}
      </div>

      {helperText && (
        <p
          id={`${fieldId}-helper`}
          role="status"
          className={`mt-2 text-xs ${STATUS_TEXT_CLASSES[status] || STATUS_TEXT_CLASSES.default}`}
        >
          {helperText}
        </p>
      )}
    </div>
  );
}
