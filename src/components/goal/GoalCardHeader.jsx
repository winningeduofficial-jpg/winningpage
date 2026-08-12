// 목표관리 앱 카드 헤더 — docs/figma-goal/00-INDEX.md §5-4 `CardHeader`.
// 타이틀 + (옵션) 인라인 보조 텍스트(meta) + 우측 액션 슬롯(`+ 성적 추가` 등 링크/버튼).
export default function GoalCardHeader({ title, meta, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">{title}</h3>
        {meta && <span className="text-[0.8125rem] font-medium leading-[1.4] text-ink-sub">{meta}</span>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
