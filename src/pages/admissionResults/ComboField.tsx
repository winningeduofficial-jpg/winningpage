import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { PopoverStatus } from "./StateBlocks";

export interface ComboOption {
  key: string;
  label: string;
  meta?: string;
}

export interface ComboValue {
  key: string;
  label: string;
}

/**
 * 셀렉터 바의 입력형 combobox 1개. 대학교/모집단위 두 필드가 이 컴포넌트를 공유하고
 * options의 meta(우측 보조 텍스트)만 다르게 넣는다.
 *
 * 저장소에 combobox 선례가 없다(role="combobox"/"listbox" grep 0건) — 이 컴포넌트가 첫 구현이다.
 *
 * 2개년 전환에서 선택형 <button> → 입력형 <input>으로 재설계했다(명세 §8.1).
 * 본선 데이터가 434행 → 43,170행이 되면서 대학 202개 / 모집단위 3,565개(키 기준)가 됐고,
 * 행 높이 3.625rem · max-h 60dvh 조합으로는 모바일에서 한 번에 ~10행만 보인다 —
 * 스크롤만으로는 탐색이 성립하지 않아 텍스트 검색이 필수다.
 *
 * 동작(Figma 1882:2431 / 1882:2634에서 UX만 차용):
 *  - 필드를 누르면 필드 아래로 팝오버가 펼쳐지고, 라벨+입력은 필드에 그대로 남는다.
 *    검색 입력을 팝오버 안에 sticky로 넣지 않는 이유가 이것이다 — 입력 지점이
 *    애초에 팝오버 바깥(필드)이라 iOS 키보드가 올라와도 가려지지 않는다.
 *  - 팝오버는 레이아웃을 밀지 않는 오버레이(absolute)다.
 *  - 스타일은 기준점 2029:661을 따른다 — 1882 계열의 border 1px #000 / radius 0 /
 *    drop-shadow는 저장소 팔레트에 없어 배제하고 #d7d7d7 + radius 20 + 부드러운 그림자로 그린다.
 *
 * 접근성:
 *  - <input role="combobox"> + aria-expanded + aria-controls + aria-autocomplete="list" +
 *    aria-activedescendant. 포커스는 열려 있는 동안에도 입력에 남고 활성 옵션은
 *    aria-activedescendant로 가리킨다(목록으로 포커스를 옮기면 Escape 후 복귀 처리가 복잡해진다).
 *  - ↑/↓/Home/End 이동, Enter 선택, Escape 닫기, Tab 닫기, 바깥 클릭 닫기.
 *    Home/End는 팝오버가 열려 있을 때만 목록 이동으로 가로채고(=선택형 시절 기능 보존),
 *    닫혀 있으면 입력 캐럿 이동이라는 텍스트 필드 기본 동작을 그대로 둔다.
 */

// 중점 4종 → U+00B7(·) 통일. 로더(scripts/build-admission-results-csv.py:96-102)의
// MIDDLE_DOT_VARIANTS와 같은 집합이다: ‧ U+2027 / ・ U+30FB / ․ U+2024 / ∙ U+2219.
// 눈으로 구분이 안 되는 글리프라 정규식에는 이스케이프로 적는다(위 주석이 대조본).
const MIDDLE_DOT_VARIANTS = /[\u2027\u30fb\u2024\u2219]/g;
const NBSP = /\u00a0/g;

/**
 * 검색어·후보를 같은 규칙으로 접는다. 이 규칙은 로더가 department_key/university_key를
 * 만들 때 쓰는 단계열(scripts/build-admission-results-csv.py의 norm_text →
 * unify_middle_dot → norm_department_name → strip_all_space)과 같아야 한다 —
 * 어긋나면 사용자가 화면에 보이는 이름 그대로 쳐도 후보가 걸리지 않는다.
 *
 * 마지막 두 단계(소문자화·중점 제거)만 검색 전용으로 더 붙인 것이다(로더에는 없다).
 * 이 함수는 키를 만들지 않고 후보와 검색어를 같은 함수로 접어 비교만 하므로 —
 * 즉 완화가 양쪽에 대칭으로 걸리므로 — 키 체계와 어긋날 여지가 없다.
 *  - toLowerCase: "AI융합학부"를 소문자로 치는 입력을 흘려보내지 않는다.
 *  - 중점 제거: 통일만 하고 남겨 두면 "기계로봇"으로는 `기계·로봇·자동차공학부`가
 *    안 걸린다. 사용자가 중점을 쳐 넣을 도리가 없으니 공백과 같은 급으로 무시한다
 *    (통일 단계를 먼저 밟는 이유는 그래야 4종 변형이 한 번에 지워지기 때문이다).
 */
function normalizeForSearch(text: unknown): string {
  return (
    String(text ?? "")
      .normalize("NFC")
      .replace(NBSP, " ")
      .replace(MIDDLE_DOT_VARIANTS, "·")
      // 로더 norm_department_name의 `&` 주변 공백 제거 단계. 바로 아래 전체 공백 제거에
      // 흡수되지만, 규칙이 1:1로 대응한다는 것을 눈으로 확인할 수 있게 남긴다.
      .replace(/\s*&\s*/g, "&")
      .replace(/\s+/g, "")
      .toLowerCase()
      .replace(/·/g, "")
  );
}

export default function ComboField({
  label,
  placeholder,
  value = null,
  options = [],
  onSelect,
  onClear, // 입력을 고쳐 기존 선택이 무효가 됐을 때. 없으면 선택을 해제하지 않는다.
  open = false,
  onOpenChange,
  disabled = false,
  disabledMessage = "",
  loading = false,
  error = false,
  onRetry,
  // 목록 자체가 비어 있는 상태(= 데이터 없음).
  emptyTitle = "",
  emptyDescription = "",
  // 목록은 있는데 검색어에 걸리는 게 없는 상태(= 검색 결과 없음). 둘은 원인이 달라 분리한다.
  noResultTitle = "검색 결과가 없습니다.",
  noResultDescription = "띄어쓰기와 중점(·)은 무시하고 찾습니다.",
  className = "",
}: {
  label: string;
  placeholder?: string;
  // SelectorBar가 자기 optional props(university?/onSelectUniversity? 등)를
  // 그대로 넘기므로 exactOptionalPropertyTypes라 undefined도 명시적으로 열어 둔다.
  value?: ComboValue | null | undefined;
  options?: ComboOption[];
  onSelect?: ((option: ComboOption) => void) | undefined;
  onClear?: (() => void) | undefined;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  disabledMessage?: string;
  loading?: boolean | undefined;
  error?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  emptyTitle?: string;
  emptyDescription?: string;
  noResultTitle?: string;
  noResultDescription?: string;
  className?: string;
}) {
  const reactId = useId();
  const inputId = `${reactId}-input`;
  const listboxId = `${reactId}-listbox`;
  const labelId = `${reactId}-label`;
  const optionId = (index: number) => `${reactId}-option-${index}`;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 입력값을 바깥 value와 동기화한 마지막 지점. 내가 만든 변화(선택/해제)와
  // 바깥에서 들어온 변화(딥링크 씨앗, 대학 변경에 따른 모집단위 초기화)를 구분하는 데 쓴다.
  const syncedRef = useRef({
    key: value?.key ?? null,
    label: value?.label ?? "",
  });

  const [query, setQuery] = useState(() => value?.label ?? "");
  // 사용자가 직접 타이핑했는가. 선택값이 그대로 입력에 남아 있는 상태에서 다시 열었을 때
  // 그 값으로 목록이 1행으로 좁혀지면 다른 후보를 못 보므로, 미입력 상태에선 필터를 걸지 않는다.
  const [dirty, setDirty] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // 정규화는 후보 수만큼 도는 유일한 비용이라 options가 바뀔 때만 미리 접어 둔다.
  // 매 입력마다 남는 일은 접어 둔 문자열에 대한 includes 선형 스캔 1회뿐이라 디바운스를 두지 않는다
  // (대학 202개 / 대학당 모집단위 중앙값 33개·최대 153개 = 서울대. 전체 모집단위 3,565개를
  //  한 화면에 거는 경우는 없다 — Q2가 대학 종속 쿼리라 목록이 애초에 대학 1곳분이다).
  const searchIndex = useMemo(
    () =>
      options.map((option) => ({
        option,
        haystack: normalizeForSearch(option.label),
      })),
    [options],
  );

  const normalizedQuery = dirty ? normalizeForSearch(query) : "";

  const filtered = useMemo(() => {
    if (!normalizedQuery) return options;
    return searchIndex
      .filter((entry) => entry.haystack.includes(normalizedQuery))
      .map((entry) => entry.option);
  }, [options, searchIndex, normalizedQuery]);

  const hasOptions = options.length > 0;
  const showList = !loading && !error && filtered.length > 0;
  const showNoResult =
    !loading && !error && hasOptions && filtered.length === 0;
  const showEmptyOptions = !loading && !error && !hasOptions;

  // 바깥에서 들어온 value 변경만 입력값에 되비춘다.
  // 타이핑 중 onClear로 value가 null이 되는 경로는 핸들러가 syncedRef를 미리 맞춰 두므로
  // 여기서 걸러진다(그렇지 않으면 입력한 글자가 곧바로 지워진다).
  useEffect(() => {
    const nextKey = value?.key ?? null;
    const nextLabel = value?.label ?? "";
    if (
      nextKey === syncedRef.current.key &&
      nextLabel === syncedRef.current.label
    )
      return;
    syncedRef.current = { key: nextKey, label: nextLabel };
    setQuery(nextLabel);
    setDirty(false);
  }, [value]);

  // 열릴 때 활성 인덱스를 현재 선택값(없거나 필터에서 빠졌으면 첫 행)으로 맞춘다.
  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    if (!filtered.length) {
      setActiveIndex(-1);
      return;
    }
    const index = value
      ? filtered.findIndex((option) => option.key === value.key)
      : -1;
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, filtered, value]);

  // 활성 행을 시야 안으로.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = listRef.current?.children?.[activeIndex];
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  // 바깥 클릭으로 닫기.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      onOpenChange?.(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open, onOpenChange]);

  function choose(index: number) {
    const option = filtered[index];
    if (!option) return;
    syncedRef.current = { key: option.key, label: option.label };
    setQuery(option.label);
    setDirty(false);
    onSelect?.(option);
    onOpenChange?.(false);
    inputRef.current?.focus();
  }

  function move(delta: number) {
    if (!showList) return;
    const count = filtered.length;
    setActiveIndex((prev) => {
      const base = prev < 0 ? (delta > 0 ? -1 : count) : prev;
      const next = base + delta;
      if (next < 0) return count - 1;
      if (next >= count) return 0;
      return next;
    });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setQuery(next);
    setDirty(true);
    if (!open) onOpenChange?.(true);
    // 입력을 고치는 순간 기존 선택은 무효다. 그대로 두면 "연세"를 쳐 놓고 조회를 누르면
    // 직전에 고른 대학이 열리는 거짓 상태가 된다. onClear가 없으면 건드리지 않는다.
    if (value && onClear) {
      syncedRef.current = { key: null, label: "" };
      onClear();
    }
  }

  function handleClear() {
    setQuery("");
    setDirty(true);
    if (!open) onOpenChange?.(true);
    if (value && onClear) {
      syncedRef.current = { key: null, label: "" };
      onClear();
    }
    inputRef.current?.focus();
  }

  function handleClick() {
    if (disabled) return;
    // 선택값이 들어 있는 상태에서 다시 누르면 통째로 지우고 새로 칠 수 있게 전체 선택한다.
    if (!dirty && query) inputRef.current?.select();
    if (!open) onOpenChange?.(true);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        onOpenChange?.(true);
      }
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onOpenChange?.(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        if (!showList) break;
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        if (!showList) break;
        event.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case "Enter":
        // 활성 행이 없으면 첫 행을 고른다(검색어를 치고 바로 Enter 치는 흐름).
        event.preventDefault();
        if (showList) choose(activeIndex < 0 ? 0 : activeIndex);
        break;
      case "Tab":
        onOpenChange?.(false);
        break;
      default:
        break;
    }
  }

  const inputPlaceholder =
    disabled && disabledMessage ? disabledMessage : placeholder;

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div
        className={`flex h-[4.5rem] w-full flex-col justify-center gap-1 px-5 transition-colors wide:h-[6.1875rem] wide:px-8 ${
          disabled
            ? ""
            : "focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#0b84fd]"
        }`}
      >
        <label
          id={labelId}
          htmlFor={inputId}
          className={`text-[0.875rem] font-medium leading-[1.3] tracking-[-0.02em] ${
            disabled ? "text-[#8f8f8f]" : "text-[#525252]"
          }`}
        >
          {label}
        </label>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={
              open && activeIndex >= 0 && showList
                ? optionId(activeIndex)
                : undefined
            }
            // disabled 대신 readOnly + aria-disabled를 쓴다. disabled 입력은 접근성 트리에서
            // 빠져 포커스가 가지 않으므로, 잠금 사유("대학을 먼저 선택하세요")를 스크린리더
            // 사용자가 탐색 중에 만날 방법이 없어진다. 상호작용은 핸들러가 막는다.
            readOnly={disabled}
            aria-disabled={disabled || undefined}
            value={query}
            placeholder={inputPlaceholder}
            onChange={handleChange}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-[1.125rem] font-medium leading-[1.3] tracking-[-0.02em] text-[#0f172a] outline-none wide:text-[1.5rem] ${
              disabled
                ? "cursor-not-allowed placeholder:text-[#8f8f8f]"
                : "placeholder:text-[#d7d7d7]"
            }`}
          />

          {!disabled && query ? (
            <button
              type="button"
              // 탭 순서에는 넣지 않는다 — 키보드 사용자는 지우기보다 바로 고쳐 치고,
              // 필드 2개 사이를 Tab으로 오가는 흐름에 버튼이 끼면 이동이 두 번씩 걸린다.
              tabIndex={-1}
              aria-label={`${label} 입력 지우기`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClear}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#8f8f8f] transition-colors hover:bg-[#f0f1f3] hover:text-[#525252]"
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="h-3.5 w-3.5"
              >
                <path
                  d="M3 3 L13 13 M13 3 L3 13"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[1.25rem] border border-[#d7d7d7] bg-white shadow-[0_0.625rem_1.75rem_rgba(13,27,42,0.12)]">
          {/* iOS 키보드가 올라오면 vh는 줄지 않아 목록 하단이 화면 밖으로 밀린다 → dvh. */}
          <div className="ar-popover-scroll max-h-[60dvh] overflow-y-auto wide:max-h-[28rem]">
            {loading ? (
              <PopoverStatus title="목록을 불러오는 중입니다." />
            ) : null}

            {!loading && error ? (
              <PopoverStatus
                tone="error"
                title="목록을 불러오지 못했습니다."
                description="잠시 후 다시 시도해 주세요."
                // PopoverStatus(수정 범위 밖)의 onRetry는 exactOptionalPropertyTypes라
                // undefined 값을 명시적으로 넣을 수 없다 — 값이 있을 때만 키를 채운다.
                {...(onRetry ? { onRetry } : {})}
              />
            ) : null}

            {showEmptyOptions ? (
              <PopoverStatus
                title={emptyTitle}
                description={emptyDescription}
              />
            ) : null}

            {showNoResult ? (
              <PopoverStatus
                title={noResultTitle}
                description={noResultDescription}
              />
            ) : null}

            {showList ? (
              <ul
                ref={listRef}
                id={listboxId}
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: APG Combobox 패턴 — 커스텀 콤보박스의 옵션 목록.
                role="listbox"
                aria-labelledby={labelId}
                tabIndex={-1}
              >
                {filtered.map((option, index) => {
                  const isActive = index === activeIndex;
                  const isSelected = value?.key === option.key;
                  return (
                    // biome-ignore lint/a11y/useFocusableInteractive: APG Combobox 패턴 — 포커스는 input에 남고 활성 옵션은 aria-activedescendant로 가리킨다(주석 §25-26 참고).
                    // biome-ignore lint/a11y/useKeyWithClickEvents: APG Combobox 패턴 — 키보드 선택은 input의 ArrowUp/Down+Enter가 activeIndex를 통해 같은 choose를 호출한다. 클릭은 마우스 사용자를 위한 보조 경로다.
                    <li
                      key={option.key}
                      id={optionId(index)}
                      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: APG Combobox 패턴 — 옵션 항목.
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(index)}
                      // 옵션을 누를 때 입력에서 포커스가 빠지지 않게 기본 동작을 막는다.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(index)}
                      className={`flex h-[3.625rem] cursor-pointer items-center justify-between gap-4 border-b border-[#d7d7d7] px-6 last:border-b-0 ${
                        isActive ? "bg-[#f9fafb]" : "bg-white"
                      }`}
                    >
                      <span
                        className={`min-w-0 truncate text-base leading-[1.3] tracking-[-0.02em] wide:text-xl ${
                          isSelected
                            ? "font-semibold text-[#013262]"
                            : "font-medium text-[#525252]"
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
