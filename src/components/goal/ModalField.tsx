import type { ChangeEventHandler, ReactNode } from "react";
import { useId } from "react";

type ModalFieldOption = { value: string; label: string; disabled?: boolean };

type ModalFieldProps = {
  label: ReactNode;
  variant?: "text" | "number" | "select" | "date";
  value?: string | number;
  onChange?: ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
  placeholder?: string;
  suffix?: ReactNode;
  options?: ModalFieldOption[];
  required?: boolean;
  className?: string;
  // 컨트롤 아래 보조 안내문(선택) — 문제집 연결 시 "일정" 필드 제약 안내(QA
  // 행286-B 후속) 등, 필드별로 짧은 캡션이 필요한 호출부만 쓴다.
  hint?: ReactNode;
  [key: string]: unknown;
};

// 모달 폼 필드 프리미티브 — docs/figma-goal/00-INDEX.md §5-4 `ModalField`.
// 라벨(h21) + 컨트롤(h39), 라벨→컨트롤 간격 27px(1.6875rem). text/number/select 3변형을 지원한다.
//
// `variant="date"`는 표에 없는 4번째 변형이지만, part-07(#19) 구현 노트가 "마감일 셀렉트에
// 더미값 '1시간 30분'이 들어 있는 건 시안 오류이고 실제로는 날짜 피커여야 한다"고 명시해서
// 최소 대응으로 추가했다(HTML date input, 별도 커스텀 피커는 이번 범위 아님).
//
// 모달 내부 칩·버튼은 pill이 아니라 소프트 라운드(6~8px)라는 지시에 따라 컨트롤은 rounded-lg(8px)를 쓴다.
export default function ModalField({
  label,
  variant = "text",
  value,
  onChange,
  placeholder,
  suffix,
  options,
  required = false,
  className = "",
  hint,
  ...rest
}: ModalFieldProps) {
  const fieldId = useId();
  const controlClass =
    "h-9.75 w-full rounded-lg border border-[#E3E3E3] bg-white px-3.5 text-[0.875rem] text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent";

  return (
    <div className={className}>
      <label
        htmlFor={fieldId}
        className="mb-6.75 block text-[0.875rem] font-semibold leading-[1.4] text-ink-strong"
      >
        {label}
        {required && (
          // 필수 표기 — 시안엔 없음, 확정 사항 §4(필수값 미입력 시 저장 버튼 disabled)에 맞춰 최소 추가.
          <span className="ml-1 text-error">*</span>
        )}
      </label>

      {variant === "select" ? (
        <select
          id={fieldId}
          value={value}
          onChange={onChange}
          className={controlClass}
          {...rest}
        >
          {options?.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="relative">
          <input
            id={fieldId}
            type={
              variant === "number"
                ? "number"
                : variant === "date"
                  ? "date"
                  : "text"
            }
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className={`${controlClass} ${suffix ? "pr-14" : ""}`}
            {...rest}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[0.8125rem] text-ink-sub">
              {suffix}
            </span>
          )}
        </div>
      )}

      {hint && (
        <p className="mt-1.5 text-[0.75rem] leading-[1.4] text-ink-sub">
          {hint}
        </p>
      )}
    </div>
  );
}
