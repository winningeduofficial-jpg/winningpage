// 요일별 자습 시간 슬라이더 행 — docs/figma-goal/00-INDEX.md §5-3 `SliderRow`.
// 트랙 800px(50rem) × 10px(0.625rem). 네이티브 <input type="range">를 써서 키보드 조작(화살표
// 키)을 기본 제공하고, 시안의 텍스트 노드뿐인 "-"/"+"는 최소 24×24 버튼으로 감싼다(접근성,
// 작업 지시 "접근성" 절).
// max=12h는 part-03(#9) 구현 노트의 "최대값 12h 가정(추정)"을 그대로 따른 것 — 확정 필요.
//
// QA 행290 — 0.1시간(6분) 단위 조정이 슬라이더 step=1만으로는 안 돼 숫자 직접 입력을
// 추가한다(type=number, step 0.1). 값은 항상 소수 1자리로 반올림한다(round1, QA 행293에서
// round2→round1로 변경) — 슬라이더 step 누적(0.1+0.2 부동소수점 오차)과 숫자 입력 둘 다
// 이 경로를 거친다.
type SliderRowProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

// QA 행293 — 0.1시간 단위 표시・저장은 소수 1자리로 반올림한다(원본 계산 모듈
// round1과 동일 규칙, src/lib/goal/calc/primitives.ts round1). 이전에는 round2(2자리)
// 를 썼는데, step이 0.1이라 어차피 대부분 1자리로만 떨어지고 숫자 직접 입력에서만
// "3.45" 같은 2자리 값이 새어들어갈 수 있었다 — round1로 그 경로까지 막는다.
// 안내 문구("소수 둘째 자리 반올림")는 카피 승인 대상이라 이 변경과 별개로 그대로 둔다
// (Step6StudyHours.tsx 참고, 문구 수정은 이 작업 범위 밖).
function round1(value: number) {
  return Math.round(value * 10) / 10;
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
    onChange(round1(clamp(value - step, min, max)));
  }

  function increase() {
    onChange(round1(clamp(value + step, min, max)));
  }

  function handleSliderChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(round1(Number(event.target.value)));
  }

  function handleNumberInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    if (raw === "") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(round1(clamp(parsed, min, max)));
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
