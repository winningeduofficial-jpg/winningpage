import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { PopoverStatus } from './StateBlocks';

/**
 * 셀렉터 바의 커스텀 listbox 1개. 대학교/모집단위 두 필드가 이 컴포넌트를 공유하고
 * options의 meta(우측 보조 텍스트)만 다르게 넣는다.
 *
 * 저장소에 combobox 선례가 없다(role="combobox"/"listbox" grep 0건) — 이 컴포넌트가 첫 구현이다.
 *
 * 동작(Figma 1882:2431 / 1882:2634에서 UX만 차용):
 *  - 필드를 누르면 필드 아래로 팝오버가 펼쳐지고, 라벨+값 헤더는 필드에 그대로 남는다.
 *  - 팝오버는 레이아웃을 밀지 않는 오버레이(absolute)다.
 *  - 스타일은 기준점 2029:661을 따른다 — 1882 계열의 border 1px #000 / radius 0 /
 *    drop-shadow는 저장소 팔레트에 없어 배제하고 #d7d7d7 + radius 20 + 부드러운 그림자로 그린다.
 *
 * 접근성:
 *  - 트리거는 role="combobox" + aria-expanded + aria-controls + aria-activedescendant.
 *    포커스는 열려 있는 동안에도 트리거에 남기고 활성 옵션은 aria-activedescendant로 가리킨다
 *    (목록으로 포커스를 옮기면 Escape 후 포커스 복귀 처리가 복잡해진다).
 *  - ↑/↓/Home/End 이동, Enter 선택, Escape 닫기(포커스는 트리거 유지), Tab 닫기, 바깥 클릭 닫기.
 */
export default function ComboField({
  label,
  placeholder,
  value = null, // { key, label } | null
  options = [], // [{ key, label, meta }]
  onSelect,
  open = false,
  onOpenChange,
  disabled = false,
  disabledMessage = '',
  loading = false,
  error = false,
  onRetry,
  emptyTitle = '',
  emptyDescription = '',
  className = ''
}) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const labelId = `${reactId}-label`;
  const valueId = `${reactId}-value`;
  const optionId = (index) => `${reactId}-option-${index}`;

  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const [activeIndex, setActiveIndex] = useState(-1);

  const selectableCount = options.length;
  const showList = !loading && !error && selectableCount > 0;

  const selectedIndex = useMemo(
    () => (value ? options.findIndex((option) => option.key === value.key) : -1),
    [options, value]
  );

  // 열릴 때 활성 인덱스를 현재 선택값(없으면 첫 행)으로 맞춘다.
  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  // 활성 행을 시야 안으로.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = listRef.current?.children?.[activeIndex];
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  // 바깥 클릭으로 닫기.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (wrapperRef.current?.contains(event.target)) return;
      onOpenChange?.(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open, onOpenChange]);

  function choose(index) {
    const option = options[index];
    if (!option) return;
    onSelect?.(option);
    onOpenChange?.(false);
    triggerRef.current?.focus();
  }

  function move(delta) {
    if (!showList) return;
    setActiveIndex((prev) => {
      const base = prev < 0 ? (delta > 0 ? -1 : selectableCount) : prev;
      const next = base + delta;
      if (next < 0) return selectableCount - 1;
      if (next >= selectableCount) return 0;
      return next;
    });
  }

  function handleKeyDown(event) {
    if (disabled) return;

    if (!open) {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault();
        onOpenChange?.(true);
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        onOpenChange?.(false);
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        if (!showList) break;
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        if (!showList) break;
        event.preventDefault();
        setActiveIndex(selectableCount - 1);
        break;
      case 'Enter':
      case ' ':
        // preventDefault로 button 기본 활성화(=click)를 막아 토글이 두 번 일어나지 않게 한다.
        event.preventDefault();
        if (showList) choose(activeIndex);
        break;
      case 'Tab':
        onOpenChange?.(false);
        break;
      default:
        break;
    }
  }

  const valueText = disabled && disabledMessage ? disabledMessage : (value?.label ?? placeholder);
  const valueTone =
    disabled && disabledMessage ? 'text-[#8f8f8f]' : value ? 'text-[#0f172a]' : 'text-[#d7d7d7]';

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-activedescendant={
          open && activeIndex >= 0 && showList ? optionId(activeIndex) : undefined
        }
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (disabled) return;
          onOpenChange?.(!open);
        }}
        onKeyDown={handleKeyDown}
        className={`flex h-[4.5rem] w-full flex-col justify-center gap-1 px-5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b84fd] wide:h-[6.1875rem] wide:px-8 ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-[#f9fafb]'
        }`}
      >
        <span
          id={labelId}
          className="text-[0.875rem] font-medium leading-[1.3] tracking-[-0.02em] text-[#525252]"
        >
          {label}
        </span>
        <span
          id={valueId}
          className={`block truncate text-[1.125rem] font-medium leading-[1.3] tracking-[-0.02em] wide:text-[1.5rem] ${valueTone}`}
        >
          {valueText}
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[1.25rem] border border-[#d7d7d7] bg-white shadow-[0_0.625rem_1.75rem_rgba(13,27,42,0.12)]">
          <div className="ar-popover-scroll max-h-[60vh] overflow-y-auto wide:max-h-[24rem]">
            {loading ? <PopoverStatus title="목록을 불러오는 중입니다." /> : null}

            {!loading && error ? (
              <PopoverStatus
                tone="error"
                title="목록을 불러오지 못했습니다."
                description="잠시 후 다시 시도해 주세요."
                onRetry={onRetry}
              />
            ) : null}

            {!loading && !error && selectableCount === 0 ? (
              <PopoverStatus title={emptyTitle} description={emptyDescription} />
            ) : null}

            {showList ? (
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-labelledby={labelId}
                tabIndex={-1}
              >
                {options.map((option, index) => {
                  const isActive = index === activeIndex;
                  const isSelected = value?.key === option.key;
                  return (
                    <li
                      key={option.key}
                      id={optionId(index)}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(index)}
                      className={`flex h-[3.625rem] cursor-pointer items-center justify-between gap-4 border-b border-[#d7d7d7] px-6 last:border-b-0 ${
                        isActive ? 'bg-[#f9fafb]' : 'bg-white'
                      }`}
                    >
                      <span
                        className={`min-w-0 truncate text-base leading-[1.3] tracking-[-0.02em] wide:text-xl ${
                          isSelected ? 'font-semibold text-[#013262]' : 'font-medium text-[#525252]'
                        }`}
                      >
                        {option.label}
                      </span>
                      {option.meta ? (
                        <span className="shrink-0 text-[0.875rem] font-normal leading-[1.3] tracking-[-0.02em] text-[#8f8f8f]">
                          {option.meta}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
