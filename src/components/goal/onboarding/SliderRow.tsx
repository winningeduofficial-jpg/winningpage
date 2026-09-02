// 요일별 자습 시간 슬라이더 행 — docs/figma-goal/00-INDEX.md §5-3 `SliderRow`.
// 트랙 800px(50rem) × 10px(0.625rem). 네이티브 <input type="range">를 써서 키보드 조작(화살표
// 키)을 기본 제공하고, 시안의 텍스트 노드뿐인 "-"/"+"는 최소 24×24 버튼으로 감싼다(접근성,
// 작업 지시 "접근성" 절).
// max=12h는 part-03(#9) 구현 노트의 "최대값 12h 가정(추정)"을 그대로 따른 것 — 확정 필요.
//
// QA 행290 — 0.1시간(6분) 단위 조정이 슬라이더 step=1만으로는 안 돼 숫자 직접 입력을
// 추가한다(type=number, step 0.1). 값은 항상 소수 둘째 자리로 반올림한다(round2) — 슬라이더
// step 누적(0.1+0.2 부동소수점 오차)과 숫자 입력 둘 다 이 경로를 거친다.
type SliderRowProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function SliderRow({
  label,
  value,
  onChange,
  min = 0,
  max = 12,
  step = 0.1,
}: SliderRowProps) {
  const pct =
    max > min
      ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
      : 0;

  function decrease() {
    onChange(round2(clamp(value - step, min, max)));
  }

  function increase() {
    onChange(round2(clamp(value + step, min, max)));
  }

  function handleSliderChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(round2(Number(event.target.value)));
  }

  function handleNumberInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    if (raw === "") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(round2(clamp(parsed, min, max)));
  }

  return (
    <div className="flex items-center gap-5">
      <span className="w-11 shrink-0 text-[0.875rem] text-ink">{label}</span>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSliderChange}
        aria-label={`${label} 자습 시간`}
        className="h-2.5 w-200 max-w-full flex-1 cursor-pointer appearance-none rounded-full accent-accent"
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
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={handleNumberInputChange}
        aria-label={`${label} 자습 시간(시간 직접 입력)`}
        className="w-13 shrink-0 rounded-md border border-line px-1 text-center text-[0.875rem] font-medium text-ink"
      />
      <span className="shrink-0 text-[0.875rem] text-ink-sub">h</span>
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
