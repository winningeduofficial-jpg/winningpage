import type { KeyboardEvent } from "react";
import { useId, useRef } from "react";

type SegmentedChipOption = { value: string; label: string };

type SegmentedChipGroupProps = {
  options: SegmentedChipOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
};

// 모달 내 단일 선택 라디오 그룹(세그먼트 칩) — docs/figma-goal/00-INDEX.md §5-4 `SegmentedChipGroup`.
// 시안 실측 폭은 80×39 ×5 / 99×39 ×4 / 81×39 ×4로 모달마다 다르지만, 폭을 고정하지 말고
// hug(콘텐츠 폭) + 균등 분배로 구현하라는 지시에 따라 폭은 지정하지 않는다(flex-1 + min-w).
// gap만 6px(0.375rem)로 3개 시안 공통.
//
// 선택 상태 스타일이 시안에 없다(00-INDEX.md §8-3 #1). 앱의 라디오 칩 패턴(파랑 보더 + 연파랑
// 배경 `surface.03`)을 준용한다 — (추정).
// 모달 내부 칩은 pill이 아니라 소프트 라운드(6~8px)라는 지시에 따라 rounded-lg(8px)를 쓴다.
//
// 접근성(코드 검수 §4): role="radiogroup"/"radio"인데 roving tabindex·방향키 이동이 없었다.
// GoalTabs.jsx의 패턴을 그대로 이식한다.
export default function SegmentedChipGroup({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedChipGroupProps) {
  const groupId = useId();
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
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1.5"
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
            id={`${groupId}-${option.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`h-9.75 min-w-16 flex-1 rounded-lg border px-3 text-[0.8125rem] font-medium leading-[1.4] transition-colors ${
              selected
                ? "border-accent bg-surface-03 font-bold text-accent" // (추정) 선택 상태
                : "border-[#E3E3E3] bg-white text-ink-sub"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
