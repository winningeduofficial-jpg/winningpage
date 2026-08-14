// 멘토신청 폼 전용 선택 칩 그룹 — docs/mentor-apply-spec.md §6-5 / §폼 명세 1-5 · 2-5 · 2-6 · 3-3 · 4-1 · 4-3.
//
// 왜 새로 만들었는가(명세 §재사용 매핑 C):
//   - `Chip.jsx` 는 `<span>` 표시 전용이라 토글 자체가 불가능하다.
//   - `column/CategoryChips.jsx` 는 단일선택 + 옵션 하드코딩 + **채움형**(선택 시 네이비 배경)인데
//     시안은 아웃라인 pill 이고 옵션이 6/12종으로 화면마다 다르다.
// 두 자산 모두 재사용 불가로 확정돼 이 컴포넌트를 신설한다.
//
// selected 시각 스펙(명세 확인 항목 ㉓): **시안에 존재하지 않는다.** 전 칩이 미선택 상태로만
// 그려졌고 프로토타입 reactions 0건·숨김 노드 0건으로 "찾으면 나온다"가 아님이 확정됐다.
// 따라서 아래 SELECTED_CLASS 는 시안 실측이 아니라 **폼의 다른 강조 토큰에서 파생한 추정값**이다
// (보더 accent #0B84FD = 필수 `*`·도움말 강조와 동일, 배경 surface.badge #D1E8FF = 사이드바
// 번호 배지 배경과 동일). 사용자 승인 전까지 잠정이며, 확정 시 이 상수 한 곳만 고치면 된다.
import type { KeyboardEvent } from "react";
import { useId, useRef } from "react";

type ChipOption = string | { value: string; label: string };

// options: string[] 또는 { value, label }[] 둘 다 허용 — src/data/mentorApply.js 의 옵션 배열
// (전부 string[])을 그대로 넘길 수 있어야 한다. auth/SelectField.jsx:16 과 같은 규약.
function normalizeOptions(options?: ChipOption[] | null) {
  return (options || []).map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

// 칩 공통 — h 40 / padding 8·16 / radius 9999 / border 1px / bg #FFFFFF / 텍스트 16 Regular #191D23.
// 높이가 h-10 으로 고정이라 세로 패딩은 시각적으로 무의미해 px-4 만 남겼다.
const CHIP_BASE_CLASS =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-full border px-4 text-base leading-[1.4] text-ink-strong transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50";

const UNSELECTED_CLASS = "border-line bg-white";

// ⚠ 파생 추정값 — 시안 근거 없음(파일 상단 주석 참고).
const SELECTED_CLASS = "border-accent bg-surface-badge";

type ChipGroupProps = {
  name?: string;
  options?: ChipOption[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  /** false → 단일선택(라디오, value 는 문자열) / true → 복수선택(체크박스, value 는 배열) */
  multiple?: boolean;
  /** 지정하면 고정 컬럼 그리드로 배치한다. 미지정이면 flex-wrap 으로 자연 줄바꿈. */
  columns?: number;
  disabled?: boolean;
  labelledBy?: string;
  ariaLabel?: string;
  className?: string;
};

export default function ChipGroup({
  name,
  options,
  value,
  onChange,
  // false → 단일선택(라디오, value 는 문자열) / true → 복수선택(체크박스, value 는 배열)
  multiple = false,
  // 지정하면 고정 컬럼 그리드로 배치한다. 미지정이면 flex-wrap 으로 자연 줄바꿈.
  // Tailwind 는 `grid-cols-${n}` 같은 동적 클래스를 스캔하지 못하므로 인라인 style 로 준다.
  columns,
  disabled = false,
  labelledBy,
  ariaLabel,
  className = "",
}: ChipGroupProps) {
  const reactId = useId();
  const groupName = name || reactId;
  const normalizedOptions = normalizeOptions(options);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedValues = multiple ? (Array.isArray(value) ? value : []) : [];
  const isSelected = (optionValue: string) =>
    multiple ? selectedValues.includes(optionValue) : value === optionValue;

  const handleSelect = (optionValue: string) => {
    if (disabled) return;

    if (!multiple) {
      onChange?.(optionValue);
      return;
    }

    const next = selectedValues.includes(optionValue)
      ? selectedValues.filter((item) => item !== optionValue)
      : [...selectedValues, optionValue];
    onChange?.(next);
  };

  // 라디오 그룹은 그룹 전체가 탭 스톱 1개여야 하고(roving tabindex) 방향키로 항목을 옮긴다.
  // 선택된 항목이 없으면 첫 칩이 탭 진입점이 된다.
  const focusIndex = normalizedOptions.findIndex((option) =>
    isSelected(option.value),
  );
  const tabStopIndex = focusIndex >= 0 ? focusIndex : 0;

  const moveFocus = (fromIndex: number, delta: number) => {
    const total = normalizedOptions.length;
    if (total === 0) return;

    const nextIndex = (fromIndex + delta + total) % total;
    chipRefs.current[nextIndex]?.focus();
    // WAI-ARIA radiogroup 관례상 방향키 이동은 곧 선택이다.
    handleSelect(normalizedOptions[nextIndex].value);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    // 체크박스 그룹(복수선택)은 각 칩이 독립 탭 스톱이라 방향키를 가로채지 않는다.
    if (multiple) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(-1, 1);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(0, -1);
    }
  };

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role이 동적이라 정적 분석이 놓친다 — group/radiogroup 둘 다 aria-label을 지원한다.
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      // 칩 간 gap 은 시안이 12(거주 지역·고등학교 유형)와 8(입시 이력·합격 전형·상담 가능
      // 분야·학년)로 혼재한다(명세 §6-10 결함 2). 다수 화면과 줄바꿈 세로 간격을 동시에
      // 만족시키기 위해 **12(0.75rem)로 통일**했다 — 확인 항목 ㉖.
      className={`gap-3 ${columns ? "grid" : "flex flex-wrap"} ${className}`}
      style={
        columns
          ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {normalizedOptions.map((option, index) => {
        const selected = isSelected(option.value);

        return (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role이 동적이라 정적 분석이 놓친다 — checkbox/radio 둘 다 aria-checked를 지원한다.
          <button
            key={option.value}
            ref={(node) => {
              chipRefs.current[index] = node;
            }}
            type="button"
            name={groupName}
            role={multiple ? "checkbox" : "radio"}
            aria-checked={selected}
            tabIndex={multiple || index === tabStopIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => handleSelect(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`${CHIP_BASE_CLASS} ${selected ? SELECTED_CLASS : UNSELECTED_CLASS}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
