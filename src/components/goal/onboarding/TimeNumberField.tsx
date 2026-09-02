import type { ChangeEventHandler, ReactNode } from "react";

// 시각(time-of-day) 숫자 입력 — QA 행293 Step7(하루 일정) 전용. GradeNumberField.tsx와
// 같은 시각적 패턴(라벨 위 / 인풋 / 접미사 우측 절대배치)을 따르되, 등급(1~9 텍스트)이
// 아니라 0~30 범위 시각을 0.5h 스텝으로 받는다는 점이 다르다 — <input type="number">를
// 써서 네이티브 스텝퍼(위/아래 화살표)를 그대로 활용한다.
type TimeNumberFieldProps = {
  label?: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: ReactNode;
};

export default function TimeNumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 30,
  step = 0.5,
  suffix = "시",
}: TimeNumberFieldProps) {
  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const raw = event.target.value;
    if (raw === "") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <div className="w-full">
      {label && <p className="mb-1.5 text-[0.8125rem] text-ink-sub">{label}</p>}
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={handleChange}
          aria-label={typeof label === "string" ? label : undefined}
          className={`h-13 w-full rounded-xl border border-line bg-white px-4 text-[0.9375rem] text-ink focus:border-accent focus:outline-hidden ${
            suffix ? "pr-10" : ""
          }`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[0.8125rem] text-ink-sub">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
