// 다중/단일 선택 인터랙티브 칩 — `SubjectChip`(components/goal/SubjectChip.jsx)은 표시 전용
// `<span>`(onClick·선택 상태 없음)이라 방해 요인·핵심 학습 항목 같은 선택형 칩에는 쓸 수 없어
// 새로 만든다.
//
// 선택됨 스타일이 시안에 없다(part-09 §239~240 "선택 상태(선택됨 스타일)는 이 프레임에 표현되어
// 있지 않다 → 선택 시 시각 스펙은 별도 정의 필요"). 앱의 라디오 칩 패턴(파랑 보더 + `surface.03`
// 배경, `SegmentedChipGroup.jsx` 참고)을 pill(`radius-button 99`, part-09 §248)로 옮겨 준용한다
// (추정).
export default function SelectChip({ label, selected, onClick }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onClick}
      className={`flex h-[3.25rem] w-fit shrink-0 items-center justify-center rounded-full border px-5 text-[0.9375rem] font-medium leading-[1.2] transition-colors ${
        selected
          ? "border-accent bg-surface-03 font-bold text-accent"
          : "border-line bg-white text-ink"
      }`}
    >
      {label}
    </button>
  );
}
