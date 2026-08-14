import type { KeyboardEvent } from "react";
import { useRef } from "react";

type PeriodOption = { value: string; label: string };

type PeriodChipRowProps = {
  options: PeriodOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
};

// 학습방향 리포트 기간 칩(텍스트형) — part-13 §92·§96("텍스트 탭"과 별개, 박스 없는 텍스트형
// 단일 선택). 선택 상태는 굵기+색 대비로만 표현한다(시안에 보더/배경 박스 없음).
//
// 접근성(코드 검수 §4): role="radiogroup"/"radio"인데 roving tabindex·방향키 이동이 없었다.
// GoalTabs.jsx의 패턴을 그대로 이식한다.
export default function PeriodChipRow({
  options,
  value,
  onChange,
  ariaLabel,
}: PeriodChipRowProps) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusOption = (index: number) => {
    const el = optionRefs.current[index];
    if (el) el.focus();
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
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
          // biome-ignore lint/a11y/useSemanticElements: 위 주석대로 roving tabindex + 방향키 이동을 직접 구현한 라디오그룹이다(코드 검수 §4 수정 이력). optionRefs.focus() 호출과 tabIndex 로직이 button 기준으로 맞춰져 있어 input 전환은 그 로직 전체를 다시 검증해야 하는 더 큰 리스크라 시각 회귀 우려까지 겹쳐 보류한다 — 별도 QA 필요.
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
