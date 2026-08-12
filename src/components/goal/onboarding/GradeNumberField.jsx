// 등급 숫자 입력 — docs/figma-goal/00-INDEX.md §5-3 `GradeNumberField`.
// 폭은 스텝마다 다르다: 내신(4단계) 256px(16rem) + 접미 "등급", 모의고사(5단계) 100px(6.25rem)
// + 라벨만(접미 없음). 두 변형 모두 이 컴포넌트 하나로 처리한다(width/suffix/label prop 분기).
export default function GradeNumberField({
  label,
  value,
  onChange,
  disabled = false,
  suffix,
  width = '16rem',
  placeholder = '3.24'
}) {
  return (
    <div style={{ width }}>
      {label && <p className="mb-[0.375rem] text-[0.875rem] text-ink-sub">{label}</p>}
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={onChange}
          placeholder={placeholder}
          className={`h-[4.25rem] w-full rounded-[0.75rem] border px-[1.25rem] text-[1rem] text-ink placeholder:text-ink-sub focus:border-accent focus:outline-none ${
            suffix ? 'pr-[3.5rem]' : ''
          } ${disabled ? 'border-line bg-surface-01 text-ink-sub' : 'border-line bg-white'}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-[1.25rem] top-1/2 -translate-y-1/2 text-[0.875rem] text-ink-sub">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
