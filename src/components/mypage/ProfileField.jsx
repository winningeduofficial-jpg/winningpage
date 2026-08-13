// 마이페이지 "내 정보 수정" 공용 필드 행 — 라벨(위) + 입력(아래) + 입력 우측 보조 버튼(변경).
// 시안(3762:20170) 실측: 이름만 액션 버튼 없이 직접 편집(블러 시 저장), 학교·학년/휴대폰은
// "변경" 클릭 시 인라인 편집 모드로 전환, 이메일/비밀번호는 백엔드 미구현이라 버튼만 노출.
//
// children이 오면 기본 <input> 대신 그대로 렌더한다(학교·학년처럼 select+input을 한 행에
// 묶어야 하는 복합 필드, 인라인 편집 모드의 저장/취소 버튼 조합 등).
// actions가 오면 우측 슬롯에 actionLabel 단일 버튼 대신 그대로 렌더한다(저장/취소 2버튼 조합).
export default function ProfileField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  readOnly = false,
  actionLabel, // 예: '변경'
  onAction,
  actionDisabled = false,
  helperText,
  children,
  actions,
  className = "",
}) {
  return (
    <div className={className}>
      {label && <label className="mb-2 block text-sm text-ink">{label}</label>}

      <div className="flex items-center gap-2">
        {children || (
          <input
            type={type}
            value={value ?? ""}
            onChange={(e) => onChange?.(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            readOnly={readOnly}
            className={`h-[3.25rem] w-full rounded-xl border border-line px-5 text-base text-ink outline-none transition placeholder:text-ink-sub focus:border-primary ${
              readOnly ? "bg-surface-footer text-ink-sub" : ""
            }`}
          />
        )}

        {actions ||
          (actionLabel && (
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className="h-[3.25rem] shrink-0 whitespace-nowrap rounded-xl border border-line px-4 text-sm text-ink transition hover:bg-surface-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLabel}
            </button>
          ))}
      </div>

      {helperText && <p className="mt-2 text-xs text-ink-sub">{helperText}</p>}
    </div>
  );
}
