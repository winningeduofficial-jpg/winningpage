import { useRef } from "react";

// 학습방향 리포트 기간 칩(텍스트형) — part-13 §92·§96("텍스트 탭"과 별개, 박스 없는 텍스트형
// 단일 선택). 선택 상태는 굵기+색 대비로만 표현한다(시안에 보더/배경 박스 없음).
//
// 접근성(코드 검수 §4): role="radiogroup"/"radio"인데 roving tabindex·방향키 이동이 없었다.
// GoalTabs.jsx의 패턴을 그대로 이식한다.
export default function PeriodChipRow({ options, value, onChange, ariaLabel }) {
  const optionRefs = useRef([]);

  const focusOption = (index) => {
    const el = optionRefs.current[index];
    if (el) el.focus();
  };

  const handleKeyDown = (event, index) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = (index + 1) % options.length;
      onChange(options[next].value);
      focusOption(next);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = (index - 1 + options.length) % options.length;
      onChange(options[prev].value);
      focusOption(prev);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-5"
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              optionRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`text-[0.875rem] leading-[1.4] transition-colors ${
              selected
                ? "font-bold text-ink-strong"
                : "font-normal text-ink-sub hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
