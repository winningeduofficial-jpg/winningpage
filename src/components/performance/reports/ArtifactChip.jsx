// 저장 리포트 산출물 칩 — docs/수행평가-상세-명세.md §5.18(`3754:3121`)/§7.3 실측.
//
// h 2rem(32) r0.5rem(8), 보유는 `fill #e7f2fb`(performance-chip) + `#1b5da0` 텍스트,
// 미보유는 `fill #f5f5f7`(surface-04) + `#808080`(ink-sub) 텍스트 — 둘 다 0.875rem/1.25rem
// w600. 보유 칩만 클릭 가능하다(§5.18 「없는 타입은 「~ 없음」 disabled」) — 클릭하면
// 호출부가 그 산출물의 리포트 뷰어 모달을 연다.
//
// 텍스트색은 `accent`(#0b84fd, 흰 배경 3.23:1)가 아니라 `#1b5da0`(6.73:1, WCAG AA 통과) —
// `accent` 토큰은 배경/보더/링 등 텍스트 외 용도에도 전역 공유돼 토큰 자체를 바꾸지
// 않고 이 칩 텍스트에만 국소 적용한다(PerformanceReportSurface.jsx 링크색과 동일 근거).
//
// @param {string} label 칩 라벨(호출부가 보유/미보유 문구를 이미 골라 넘긴다).
// @param {boolean} available
// @param {() => void} [onClick] `available`일 때만 호출된다.
export default function ArtifactChip({ label, available, onClick }) {
  return (
    <button
      type="button"
      onClick={available ? onClick : undefined}
      disabled={!available}
      aria-disabled={!available}
      className={[
        "flex h-8 items-center rounded-lg px-3 text-[0.875rem] font-semibold leading-5 transition",
        available
          ? "bg-performance-chip text-[#1b5da0] hover:bg-performance-chip/70"
          : "cursor-not-allowed bg-surface-04 text-ink-sub",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
