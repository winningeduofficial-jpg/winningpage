import radioChecked from '../../../assets/renewal/radio-checked.svg';
import radioUnchecked from '../../../assets/renewal/radio-unchecked.svg';

/**
 * OptionGroup
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:13222 ("설문조사 선택한 상태")
 *
 * variant='chip' → 인라인(auto-width) pill 나열 (예: 학년/학교유형 선택)
 * variant='row'  → 전폭(w-full) 리스트 라디오 (예: 진학 목표 선택)
 *
 * 단일 선택이면 value는 string, 다중 선택(multiple=true)이면 value는 array.
 * max가 있으면 다중 선택에서 max개 초과 클릭은 무시한다.
 */
function normalizeOption(option) {
  if (typeof option === 'string') return { value: option, label: option };
  return { value: option.value ?? option.label, label: option.label };
}

export default function OptionGroup({
  options = [],
  multiple = false,
  max,
  value,
  onChange,
  variant = 'row'
}) {
  const selectedList = multiple ? (Array.isArray(value) ? value : []) : [];

  function handleSelect(optionValue) {
    if (!onChange) return;

    if (!multiple) {
      onChange(optionValue);
      return;
    }

    const exists = selectedList.includes(optionValue);
    if (exists) {
      onChange(selectedList.filter((item) => item !== optionValue));
      return;
    }
    if (max && selectedList.length >= max) return;
    onChange([...selectedList, optionValue]);
  }

  const containerClass =
    variant === 'chip'
      ? 'flex w-full flex-wrap items-start gap-3'
      : 'flex w-full flex-col items-start gap-3';

  return (
    <div className={containerClass} role={multiple ? 'group' : 'radiogroup'}>
      {options.map((rawOption) => {
        const { value: optionValue, label } = normalizeOption(rawOption);
        const active = multiple ? selectedList.includes(optionValue) : value === optionValue;
        const maxReached = multiple && !!max && !active && selectedList.length >= max;

        return (
          <button
            key={optionValue}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={active}
            disabled={maxReached}
            onClick={() => handleSelect(optionValue)}
            className={`flex h-[4.25rem] items-center gap-6 rounded-[1.25rem] border px-5 py-3.5 text-left transition ${
              variant === 'row' ? 'w-full' : 'w-auto'
            } ${
              active
                ? 'border-[#013262] bg-[#E9F4FF]'
                : 'border-[#d7d7d7] bg-white hover:border-[#013262]/40'
            } ${maxReached ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <img
              src={active ? radioChecked : radioUnchecked}
              alt=""
              aria-hidden="true"
              className="size-6 shrink-0"
            />
            <span
              className={`break-keep text-xl font-normal ${
                active ? 'text-[#013262]' : 'text-[#525252]'
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
