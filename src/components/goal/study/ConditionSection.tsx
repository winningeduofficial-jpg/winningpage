import type { KeyboardEvent } from "react";
import { useRef } from "react";
import GoalCard from "@/components/goal/GoalCard";

type ConditionOption = { value: string; label: string; emoji?: string };

type ConditionSectionProps = {
  options: ConditionOption[];
  // 미선택 초기 상태(DailyRecord.tsx의 condition state)를 null로 표현한다 — 비교(===)만
  // 하므로 null도 안전하게 처리된다(아무 것도 선택되지 않은 상태와 동일).
  value: string | null;
  onChange: (value: string) => void;
};

// 섹션2 "오늘의 컨디션"(639×265) — 단일 선택 라디오 타일 4개(139×143). part-09 §176~180.
// 선택됨 스타일이 시안에 없어(part-09 §239~240) `SegmentedChipGroup.jsx`의 선택 패턴(파랑 보더 +
// `surface.03` 배경)을 그대로 준용한다(추정).
//
// 접근성(코드 검수 §4): role="radiogroup"/"radio"인데 roving tabindex·방향키 이동이 없었다.
// GoalTabs.jsx의 패턴을 그대로 이식한다.
export default function ConditionSection({
  options,
  value,
  onChange,
}: ConditionSectionProps) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusOption = (index: number) => {
    const el = optionRefs.current[index];
    if (el) el.focus();
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = (index + 1) % options.length;
      // 모듈 연산으로 항상 배열 범위 안의 인덱스만 나온다.
      onChange(options[next]!.value);
      focusOption(next);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = (index - 1 + options.length) % options.length;
      // 모듈 연산으로 항상 배열 범위 안의 인덱스만 나온다.
      onChange(options[prev]!.value);
      focusOption(prev);
    }
  };

  return (
    <GoalCard
      tone="neutral"
      className="flex h-full flex-col gap-5 px-[2rem] py-[1.875rem]"
    >
      <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
        오늘의 컨디션
      </h3>
      <div
        role="radiogroup"
        aria-label="오늘의 컨디션"
        className="flex flex-wrap gap-[0.625rem]"
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
              className={`flex h-[8.9375rem] w-[8.6875rem] flex-1 flex-col items-center justify-center gap-2 rounded-xl border transition-colors ${
                selected
                  ? "border-accent bg-surface-03 font-bold text-accent"
                  : "border-line bg-white text-ink"
              }`}
            >
              <span className="text-[1.75rem] leading-none" aria-hidden="true">
                {option.emoji}
              </span>
              <span className="text-[0.875rem] leading-[1.4]">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </GoalCard>
  );
}
