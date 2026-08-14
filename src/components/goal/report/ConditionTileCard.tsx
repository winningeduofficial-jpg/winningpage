import GoalCard from "../GoalCard";
import InsightBox from "../InsightBox";

// Row3 카드② — docs/figma-goal/00-INDEX.md §5-4 `ConditionTile`. 시안 원 제목은 `시간대별 학습
// 효율`이지만 내용은 컨디션 타일이라 결함5로 `컨디션별 학습량`으로 정정했다(이 컴포넌트는
// title을 그대로 받는다). 타일 4개(😆/🙂/😣/😫) + 하단 인사이트 박스 — 실배선(D6, 팀장 확정)이
// great/normal/tired/exhausted 4종 전부를 노출해야 해서 시안 원안(3타일)에서 grid-cols를
// 4로 늘렸다(판단 지점, 시안 결함 정정과 별개의 실배선 요구사항 반영).
function ConditionTile({ emoji, label, value, avg }) {
  return (
    <div className="flex h-[8.25rem] w-full flex-col items-center justify-center gap-1 rounded-xl bg-white px-2 text-center">
      <span className="text-[1.5rem] leading-none" aria-hidden="true">
        {emoji}
      </span>
      <span className="text-[0.8125rem] font-semibold leading-[1.4] text-ink-strong">
        {label}
      </span>
      <span className="text-[0.9375rem] font-bold leading-[1.3] text-ink-strong">
        {value}
      </span>
      <span className="text-[0.75rem] leading-[1.4] text-ink-sub">{avg}</span>
    </div>
  );
}

export default function ConditionTileCard({ title, tiles, tip }) {
  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-[22.4375rem] flex-col gap-5 px-6 py-6"
    >
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <ConditionTile key={tile.label} {...tile} />
        ))}
      </div>
      {tip && (
        <InsightBox variant={tip.variant} className="mt-auto">
          {tip.text}
        </InsightBox>
      )}
    </GoalCard>
  );
}
