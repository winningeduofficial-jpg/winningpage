import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// 플레이스홀더는 Figma 시안 `1889:10708`(survey-10656.md §2.6)의 필드 표시값 원문이다
// (`건국대학교` / `경영학과` / `학생부종합` / `KU자기추천`). 안내문이 아니라 예시 값이며,
// 시안에서 4개 값 텍스트 모두 `#D7D7D7`(플레이스홀더 컬러)로 그려져 있어 미선택 상태를 나타낸다.
// 이전 문구(`대학을 선택해 주세요` 등)는 시안 근거가 없는 자체 작문이었고, 필드 가용폭 138px 에
// 실측 166~245px 라 잘리고 있었다. 시안 값은 최장 약 110px 로 절단이 발생하지 않는다.
//
// 비활성 상태 전용 문구는 시안에 없다 — 필드 모두 자기 예시 값을 그대로 표시한다
// (활성/비활성은 disabled 동작·스타일로만 구분한다).
//
// B-1 확정(2026-08-11) — 더미 `UNIVERSITY_DATA` 는 삭제됐다. 대학·학과·전형유형·세부전형명·
// 반영교과 4~5단 전부 parent(useAdmissionCascade)가 async 로 채운 options/loading/error 를
// 그대로 그린다 — 이 컴포넌트는 실데이터가 몇 종인지 전혀 알 필요가 없다(6종→11종으로 늘어도
// 무변경). `key`·`label`·`placeholder`·`options`·`loading`·`error` 를 가진 level 객체 배열을
// 그대로 받는 순수 표시·상호작용 컴포넌트다.
function resolveMeta(levels) {
  return (levels ?? []).map((level) => ({
    key: level.key,
    label: level.label,
    placeholder: level.placeholder ?? "",
    options: level.options ?? [],
    loading: Boolean(level.loading),
    error: level.error ?? null,
    onRetry: typeof level.onRetry === "function" ? level.onRetry : null,
  }));
}

export default function CascadingSelect({ levels, value, onChange }) {
  const currentValue = value || {};
  const meta = resolveMeta(levels);
  const [openIndex, setOpenIndex] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (openIndex === null) return undefined;

    function handlePointerDown(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpenIndex(null);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpenIndex(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openIndex]);

  function handleSelect(index, option) {
    const next = { ...currentValue, [meta[index].key]: option };
    for (let i = index + 1; i < meta.length; i += 1) {
      next[meta[i].key] = "";
    }
    onChange?.(next);
    setOpenIndex(null);
  }

  // 4열 고정 그리드는 228×4 + 20×3 = 972 를 요구한다. lg(1024) 에서 카드 내부 가용 폭은
  // 1024 − 64(sm:px-8) − 80(카드 sm:px-10) = 870 뿐이라 그리드가 카드 밖으로 튀어나갔다.
  // wide(74rem/1184) 부터는 컨테이너가 max-w-content(1164) 로 고정되어 가용 폭이
  // 1164 − 64 − 120 = 980 ≥ 972 가 되므로 여기서 4열을 켠다.
  // 1184 미만은 sm(640) 부터의 2×2 를 유지한다 — 3열은 4번째 필드만 홀로 남아 계단식 순서가 깨진다.
  // 2열 트랙에는 상한 22rem(352) 을 건다. 순수 1fr 이면 1024 에서 필드 하나가 427px 까지 벌어져
  // (시안 228 대비 1.87배) `건국대학교` 같은 짧은 값 하나에 과대한 폭이 배정되고 문항 밀도가 무너진다.
  // 640(235) · 768(299) 은 상한 미만이라 현행 폭 그대로다. 최장 표시값 `KU자기추천`(20px 약 110px)은
  // 235px 필드의 가용 텍스트 폭 147px 안에 들어가 절단이 없다. <640 은 1열 세로 4단 (§9-A5).
  return (
    <div
      ref={containerRef}
      // B-1(2026-08-11) — 5단째(반영교과/영역)는 후보 2개 이상일 때만 meta 에 추가되므로 wide 트랙도
      // meta.length 에 맞춰 5열로 좁혀 그린다(4열 972 규격과 같은 산식: 11rem×5+1.25rem×4=60rem≈960px).
      className={`grid w-full max-w-[62rem] grid-cols-1 gap-4 sm:grid-cols-[repeat(2,minmax(0,22rem))] wide:gap-5 ${
        meta.length >= 5
          ? "wide:grid-cols-[repeat(5,11rem)]"
          : "wide:grid-cols-[repeat(4,14.25rem)]"
      }`}
    >
      {meta.map((level, index) => {
        const selected = currentValue[level.key] || "";
        const options = level.options;
        const enabled =
          index === 0 || Boolean(currentValue[meta[index - 1].key]);
        const isOpen = openIndex === index;

        return (
          <div key={level.key} className="relative flex min-w-0 flex-col gap-2">
            <p
              className={`text-base font-medium leading-5 ${
                enabled ? "text-[#525252]" : "text-[#D7D7D7]"
              }`}
            >
              {level.label}
            </p>

            <button
              type="button"
              disabled={!enabled}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              onClick={() => enabled && setOpenIndex(isOpen ? null : index)}
              className={`flex h-[4.25rem] w-full items-center justify-between gap-6 rounded-[1.25rem] border px-5 text-left text-xl font-normal leading-5 transition-[background-color,border-color,color] duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/30 ${
                !enabled
                  ? "cursor-not-allowed border-[#D7D7D7] bg-[#F5F5F5] text-[#D7D7D7]"
                  : isOpen
                    ? "border-[#013262] bg-white text-[#181D24]"
                    : selected
                      ? "border-[#013262] bg-white text-[#181D24] hover:border-[#B0B0B0]"
                      : "border-[#D7D7D7] bg-white text-[#D7D7D7] hover:border-[#B0B0B0]"
              }`}
            >
              <span className="truncate">{selected || level.placeholder}</span>
              {/* chevron: lucide-react ChevronDown 24 유지 (§7 C-7 — 별도 SVG 추출 안 함) */}
              <ChevronDown
                size={24}
                className={`shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180 text-[#013262]" : ""} ${
                  !enabled
                    ? "text-[#D7D7D7]"
                    : selected
                      ? "text-[#013262]"
                      : "text-[#D7D7D7]"
                }`}
              />
            </button>

            {isOpen && (
              <div
                role="listbox"
                aria-label={level.label}
                className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 max-h-72 overflow-y-auto rounded-2xl border border-[#EDEDED] bg-white p-2 shadow-[0_1rem_2.5rem_rgba(15,23,42,0.12)]"
              >
                {level.loading ? (
                  <p className="px-4 py-3 text-base text-[#808080]">
                    불러오는 중입니다…
                  </p>
                ) : level.error ? (
                  // 재시도 콜백이 있으면(대학 단계) 다시 조회할 수 있게 버튼을 함께 준다 —
                  // 없으면(하위 단계) 상위 선택을 바꾸면 자연히 재조회되므로 안내만 남긴다.
                  <div className="flex flex-col gap-2 px-4 py-3">
                    <p className="text-base text-[#C23B3B]">
                      목록을 불러오지 못했습니다.
                    </p>
                    {level.onRetry && (
                      <button
                        type="button"
                        onClick={() => level.onRetry()}
                        className="inline-flex min-h-[2.75rem] w-fit items-center rounded-xl border border-[#013262] px-4 py-2 text-base font-medium text-[#013262] transition hover:bg-[#F1F8FF] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/30"
                      >
                        다시 시도
                      </button>
                    )}
                  </div>
                ) : options.length === 0 ? (
                  <p className="px-4 py-3 text-base text-[#808080]">
                    선택 가능한 옵션이 없습니다.
                  </p>
                ) : (
                  options.map((option) => {
                    const isSelected = option === selected;
                    return (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(index, option)}
                        className={`flex min-h-[2.75rem] w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-base transition hover:bg-[#F1F8FF] ${
                          isSelected
                            ? "bg-[#F1F8FF] font-medium text-[#013262]"
                            : "text-[#525252]"
                        }`}
                      >
                        <span className="truncate">{option}</span>
                        {isSelected && (
                          <Check
                            size={18}
                            className="shrink-0 text-[#013262]"
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
