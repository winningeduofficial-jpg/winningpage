import radioChecked from '../../../assets/renewal/radio-checked.svg';
import radioUnchecked from '../../../assets/renewal/radio-unchecked.svg';

/**
 * OptionGroup
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:13222 ("설문조사 선택한 상태")
 *
 * variant='chip' → 내용 기준 hug 폭 칩을 flex-wrap 나열 (Q1·Q2·Q8하위·Q13·Q14·Q16·Q17·Q18)
 * variant='row'  → 전폭(w-full) 리스트 행 (Q3·Q4·Q5·Q8·Q10·Q12·Q3-C)
 *
 * 행/칩 공통 규격 (시안 실측):
 *   min-h 68 (4.25rem) / bg #FFFFFF / border 1px #D7D7D7 / radius 20 (1.25rem)
 *   padding 14·20 (0.875rem·1.25rem) / 아이콘 24 ↔ 라벨 gap 24 (1.5rem) / 행간 gap 12 (0.75rem)
 *   높이는 min-h — 375px 뷰포트에서 최장 라벨이 3줄이 되어도 넘치지 않는다.
 *   라벨 line-height 는 시안 원값(20px, 비율 1.0)을 승계하지 않고 1.4 를 쓴다 (SPEC 3.1-6 예외).
 *
 * 상태 (SPEC-fd-ver3-v2 §9-A1):
 *   selected      bg #F1F8FF / border #013262 / 라벨 #013262      (시안 실측 — #E9F4FF 는 범용 변수 `메인 채우기` 오적용, 2026-07-30 중재 확정)
 *   hover(미선택)  border #013262 20% + bg #FBFAFA, transition 150ms
 *   hover(선택됨)  변화 없음
 *   focus         :focus-visible 만 — outline 2px #0B84FD, offset 2px
 *   disabled      opacity 50% + cursor-not-allowed
 *   error         border #D92D20 + 하단 안내문 (스타일만, 검증 로직 없음)
 *
 * 단일 선택이면 value는 string, 복수 선택(multiple=true)이면 value는 string[].
 * - maxSelect  : 도달 시 미선택 항목을 disabled 처리하고 초과 클릭은 무시한다.
 *                도달 상태에서도 이미 선택된 항목의 해제는 계속 가능하다(자동 FIFO 교체 없음).
 * - exclusiveValues : 선택 시 같은 문항의 나머지 선택을 전부 해제하는 배타 선택지.
 *                     역방향도 성립 — 배타값이 선택된 상태에서 일반 항목을 고르면 배타값이 해제된다.
 */
function normalizeOption(option) {
  if (typeof option === 'string') return { value: option, label: option };
  return { value: option.value ?? option.label, label: option.label };
}

export default function OptionGroup({
  options = [],
  multiple = false,
  maxSelect,
  exclusiveValues = [],
  value,
  onChange,
  variant = 'row',
  disabled = false,
  error = false,
  errorMessage
}) {
  const selectedList = multiple ? (Array.isArray(value) ? value : []) : [];
  const limit = maxSelect ?? Infinity;
  const limitReached = multiple && selectedList.length >= limit;

  function handleSelect(optionValue) {
    if (!onChange || disabled) return;

    if (!multiple) {
      onChange(optionValue);
      return;
    }

    // 이미 선택된 항목 → 항상 해제 가능 (maxSelect 도달 상태에서도).
    if (selectedList.includes(optionValue)) {
      onChange(selectedList.filter((item) => item !== optionValue));
      return;
    }

    // 배타 선택지 → 나머지 전부 해제하고 이것만 남긴다.
    if (exclusiveValues.includes(optionValue)) {
      onChange([optionValue]);
      return;
    }

    // 일반 항목 → 선택 중인 배타값을 먼저 걷어낸다.
    const withoutExclusive = selectedList.filter((item) => !exclusiveValues.includes(item));
    if (withoutExclusive.length >= limit) return;
    onChange([...withoutExclusive, optionValue]);
  }

  const containerClass =
    variant === 'chip'
      ? 'flex w-full flex-wrap items-start gap-3'
      : 'flex w-full flex-col items-start gap-3';

  return (
    <div className="flex w-full flex-col items-start">
      <div className={containerClass} role={multiple ? 'group' : 'radiogroup'}>
        {options.map((rawOption) => {
          const { value: optionValue, label } = normalizeOption(rawOption);
          const active = multiple ? selectedList.includes(optionValue) : value === optionValue;
          // 배타 선택지는 maxSelect 카운트와 무관하게 항상 클릭 가능해야 한다.
          const blockedByLimit =
            limitReached && !active && !exclusiveValues.includes(optionValue);
          const isDisabled = disabled || blockedByLimit;

          return (
            <button
              key={optionValue}
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={active}
              disabled={isDisabled}
              onClick={() => handleSelect(optionValue)}
              className={`flex min-h-[4.25rem] items-center gap-6 rounded-[1.25rem] border px-5 py-3.5 text-left transition-[background-color,border-color,color] duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                variant === 'row' ? 'w-full' : 'w-auto'
              } ${
                active
                  ? 'border-[#013262] bg-[#F1F8FF]'
                  : error
                    ? 'border-[#D92D20] bg-white'
                    : 'border-[#D7D7D7] bg-white enabled:hover:border-[#013262]/20 enabled:hover:bg-[#FBFAFA]'
              } ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <img
                src={active ? radioChecked : radioUnchecked}
                alt=""
                aria-hidden="true"
                className="size-6 shrink-0"
              />
              <span
                className={`break-keep text-xl font-normal leading-[1.4] ${
                  active ? 'text-[#013262]' : 'text-[#525252]'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {error && errorMessage && (
        <p className="mt-3 text-[0.75rem] font-medium leading-[1.4] text-[#D92D20]">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
