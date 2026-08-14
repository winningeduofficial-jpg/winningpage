import GoalCard from "../GoalCard";

// 멘토 코멘트 카드(1340×147) — docs/figma-goal/00-INDEX.md §5-4 `MentorCommentCard`.
// 리포트 최하단 공통 요소. 제목 + 작성일(인라인) + 본문 1문단.
export default function MentorCommentCard({
  title = "멘토 코멘트",
  dateLabel,
  body,
}) {
  return (
    <GoalCard tone="neutral" className="flex flex-col gap-3 px-8 py-7">
      <div className="flex items-baseline gap-3">
        <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
          {title}
        </h3>
        <span className="text-[0.75rem] leading-[1.4] text-ink-sub">
          {dateLabel}
        </span>
      </div>
      <p className="text-[0.875rem] leading-[1.6] text-ink">{body}</p>
    </GoalCard>
  );
}
