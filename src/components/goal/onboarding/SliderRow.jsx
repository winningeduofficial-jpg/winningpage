// 요일별 자습 시간 슬라이더 행 — docs/figma-goal/00-INDEX.md §5-3 `SliderRow`.
// 트랙 800px(50rem) × 10px(0.625rem). 네이티브 <input type="range">를 써서 키보드 조작(화살표
// 키)을 기본 제공하고, 시안의 텍스트 노드뿐인 "-"/"+"는 최소 24×24 버튼으로 감싼다(접근성,
// 작업 지시 "접근성" 절).
// max=12h는 part-03(#9) 구현 노트의 "최대값 12h 가정(추정)"을 그대로 따른 것 — 확정 필요.
export default function SliderRow({
  label,
  value,
  onChange,
  min = 0,
  max = 12,
  step = 1,
}) {
  const pct =
    max > min
      ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
      : 0;

  function decrease() {
    onChange(Math.max(min, value - step));
  }

  function increase() {
    onChange(Math.min(max, value + step));
  }

  return (
    <div className="flex items-center gap-[1.25rem]">
      <span className="w-[2.75rem] shrink-0 text-[0.875rem] text-ink">
        {label}
      </span>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label} 자습 시간`}
        className="h-[0.625rem] w-[50rem] max-w-full flex-1 cursor-pointer appearance-none rounded-full accent-accent"
        style={{
          background: `linear-gradient(to right, #0B84FD ${pct}%, #D9D9D9 ${pct}%)`,
        }}
      />

      <button
        type="button"
        onClick={decrease}
        aria-label={`${label} 자습 시간 줄이기`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-ink-sub transition-colors hover:border-accent hover:text-accent"
      >
        −
      </button>
      <span className="w-[2.25rem] shrink-0 text-center text-[0.875rem] font-medium text-ink">
        {value}h
      </span>
      <button
        type="button"
        onClick={increase}
        aria-label={`${label} 자습 시간 늘리기`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-ink-sub transition-colors hover:border-accent hover:text-accent"
      >
        +
      </button>
    </div>
  );
}
