/**
 * ConditionalTextInput
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:8753 (목표대학/희망학과 조건부 입력)
 *        + 1889:10886 (Q19 자유 서술 — 멀티라인 992×105, items-start)
 *
 * 1줄 입력과 멀티라인(textarea)을 한 컴포넌트로 처리한다 (`multiline` prop).
 * 시안 실측: 박스 992×105 (62rem × 6.5625rem), bg #FFF, r20, border 1px #D7D7D7,
 *            px20 py14 (1.25rem·0.875rem), 콘텐츠 상단 정렬.
 *
 * 상태 (SPEC-fd-ver3-v2 §9-A2):
 *   default border #D7D7D7 / placeholder #D7D7D7
 *   hover   border #B0B0B0
 *   focus   border #013262 + outline 2px #0B84FD 30%
 *   filled  텍스트 #181D24
 *   error   border #D92D20 (스타일만, 검증 로직 없음)
 */
export default function ConditionalTextInput({
  label,
  placeholder,
  value,
  onChange,
  multiline = false,
  rows = 3,
  disabled = false,
  error = false,
  errorMessage
}) {
  const boxClass = [
    'flex w-full max-w-[62rem] rounded-[1.25rem] border bg-white px-5 py-3.5 transition-[border-color,box-shadow] duration-150',
    multiline ? 'h-[6.5625rem] items-start' : 'h-[4.25rem] items-center',
    error
      ? 'border-[#D92D20]'
      : 'border-[#D7D7D7] hover:border-[#B0B0B0] focus-within:border-[#013262]',
    'focus-within:outline focus-within:outline-2 focus-within:outline-accent/30',
    disabled ? 'cursor-not-allowed border-[#D7D7D7] bg-[#F5F5F5]' : ''
  ].join(' ');

  const fieldClass =
    'w-full bg-transparent text-xl font-normal leading-[1.4] text-[#181D24] placeholder:text-[#D7D7D7] focus:outline-none disabled:cursor-not-allowed';

  return (
    <div className="flex w-full flex-col items-start gap-3">
      {label && <p className="text-base font-medium leading-5 text-[#525252]">{label}</p>}

      <div className={boxClass}>
        {multiline ? (
          <textarea
            rows={rows}
            value={value ?? ''}
            onChange={(event) => onChange?.(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={`${fieldClass} h-full resize-none`}
          />
        ) : (
          <input
            type="text"
            value={value ?? ''}
            onChange={(event) => onChange?.(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={fieldClass}
          />
        )}
      </div>

      {error && errorMessage && (
        <p className="text-[0.75rem] font-medium leading-[1.4] text-[#D92D20]">{errorMessage}</p>
      )}
    </div>
  );
}
