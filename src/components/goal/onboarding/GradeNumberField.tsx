// 등급 숫자 입력 — docs/figma-goal/00-INDEX.md §5-3 `GradeNumberField`.
// 폭은 스텝마다 다르다: 내신(4단계) 256px(16rem) + 접미 "등급", 모의고사(5단계) 100px(6.25rem)
// + 라벨만(접미 없음). 두 변형 모두 이 컴포넌트 하나로 처리한다(width/suffix/label prop 분기).
import type { ChangeEventHandler, ReactNode } from "react";

type GradeNumberFieldProps = {
  label?: ReactNode;
  value?: string | number;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  disabled?: boolean;
  suffix?: ReactNode;
  width?: string;
  placeholder?: string;
};

export default function GradeNumberField({
  label,
  value,
  onChange,
  disabled = false,
  suffix,
  width = "16rem",
  placeholder = "3.24",
}: GradeNumberFieldProps) {
  return (
    <div style={{ width }}>
      {label && <p className="mb-1.5 text-[0.875rem] text-ink-sub">{label}</p>}
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={onChange}
          placeholder={placeholder}
          className={`h-17 w-full rounded-xl border px-5 text-[1rem] text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden ${
            suffix ? "pr-14" : ""
          } ${disabled ? "border-line bg-surface-01 text-ink-sub" : "border-line bg-white"}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[0.875rem] text-ink-sub">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
