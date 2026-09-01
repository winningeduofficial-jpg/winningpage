// 마이페이지 "내 정보 수정" 공용 필드 행 — 라벨(위) + 입력(아래) + 입력 우측 보조 버튼(변경).
// 시안(3762:20170) 실측: 이름만 액션 버튼 없이 직접 편집(블러 시 저장), 학교·학년/휴대폰은
// "변경" 클릭 시 인라인 편집 모드로 전환, 이메일/비밀번호는 백엔드 미구현이라 버튼만 노출.
//
// children이 오면 기본 <input> 대신 그대로 렌더한다(학교·학년처럼 select+input을 한 행에
// 묶어야 하는 복합 필드, 인라인 편집 모드의 저장/취소 버튼 조합 등).
// actions가 오면 우측 슬롯에 actionLabel 단일 버튼 대신 그대로 렌더한다(저장/취소 2버튼 조합).
import type { FocusEventHandler, ReactNode } from "react";
import { useId } from "react";

type ProfileFieldProps = {
  label?: ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
  /** 과도 입력으로 인한 UI 깨짐 방지(QA 행266). ProfileField 자체 렌더 <input>에만 적용된다 —
   * children으로 커스텀 입력을 넘기는 필드(예: 학교·학년)는 호출부가 직접 줘야 한다. */
  maxLength?: number;
  /** 예: '변경' */
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  helperText?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function ProfileField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  readOnly = false,
  maxLength,
  actionLabel,
  onAction,
  actionDisabled = false,
  helperText,
  children,
  actions,
  className = "",
}: ProfileFieldProps) {
  const labelId = useId();
  const inputId = useId();
  return (
    <div className={className}>
      {label && (
        <label
          // children이 오면 복합 필드(select+input 등)라 htmlFor로 단일 컨트롤에 못
          // 매고, 대신 id로 남겨 아래 그룹에 aria-labelledby로 연결한다.
          id={labelId}
          htmlFor={children ? undefined : inputId}
          className="mb-2 block text-sm text-ink"
        >
          {label}
        </label>
      )}

      <div
        className="flex items-center gap-2"
        {...(children ? { role: "group", "aria-labelledby": labelId } : {})}
      >
        {children || (
          <input
            id={inputId}
            type={type}
            value={value ?? ""}
            onChange={(e) => onChange?.(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            readOnly={readOnly}
            maxLength={maxLength}
            className={`h-13 w-full rounded-xl border border-line px-5 text-base text-ink outline-hidden transition placeholder:text-ink-sub focus:border-primary ${
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
              className="h-13 shrink-0 whitespace-nowrap rounded-xl border border-line px-4 text-sm text-ink transition hover:bg-surface-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLabel}
            </button>
          ))}
      </div>

      {helperText && <p className="mt-2 text-xs text-ink-sub">{helperText}</p>}
    </div>
  );
}
