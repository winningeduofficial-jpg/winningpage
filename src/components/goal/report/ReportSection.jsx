// 리포트 섹션 헤더 — docs/figma-goal/00-INDEX.md §5-4 `SectionHeader`. 라벨(h21, Text/Strong) +
// 인라인 부제(h18, Text/Natural) + 하위 카드 Row(children). 3~4개 섹션에서 반복 사용.
export default function ReportSection({ label, subLabel, children }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
          {label}
        </h2>
        {subLabel && (
          <span className="text-[0.8125rem] leading-[1.4] text-ink-sub">
            {subLabel}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
