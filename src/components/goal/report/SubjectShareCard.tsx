import type { ReactNode } from "react";
import GoalCard from "@/components/goal/GoalCard";
import InsightBox from "@/components/goal/InsightBox";
import StatProgressRow from "./StatProgressRow";

type StatRow = { label: string; value: number };
type CardTip = { variant?: string; text?: ReactNode };

type SubjectShareCardProps = {
  title?: ReactNode;
  empty?: boolean;
  emptyMessage?: ReactNode;
  rows?: StatRow[];
  tip?: CardTip | null;
};

// Row2 카드① — 주간 `과제별 학습 비중`(빈 상태, part-11 §251) / 월간 `과목별 학습 비중`(채워짐,
// part-12 §116). 같은 컴포넌트가 empty/filled 두 상태를 카드 단위로 분기한다(작업 지시
// "카드 단위 빈 상태 사례... 이 패턴을 지원할 것").
//
// 빈 상태는 CTA가 없는 순수 안내문이라(타이머 데이터가 쌓이길 기다리는 것 외에 사용자가 할
// 액션이 없음) `GoalEmptyState`(+ 버튼 포함)를 그대로 쓰지 않고 안내문만 남긴다 — 하단 팁 박스는
// 상태와 무관하게 항상 유지한다(part-11 §351 "카드 하단 팁 박스는 그대로 유지").
export default function SubjectShareCard({
  title,
  empty,
  emptyMessage,
  rows,
  tip,
}: SubjectShareCardProps) {
  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-[27.5625rem] flex-col gap-5 px-6 py-6"
    >
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
        {title}
      </h3>

      {empty ? (
        <div className="flex flex-1 items-center justify-center px-2 text-center text-[0.875rem] leading-[1.5] text-ink-sub">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-4">
          {/* aggregate.ts computeSubjectShare 는 항상 rows 를 채워 반환(!empty ⇒ rows 존재) */}
          {rows!.map((row) => (
            <StatProgressRow
              key={row.label}
              label={row.label}
              value={row.value}
              unit="%"
              max={100}
            />
          ))}
        </div>
      )}

      {tip && (
        // InsightBox(다른 UoW 소유)는 undefined 미허용 — "info"는 InsightBox 자체 기본값과 동일
        <InsightBox variant={tip.variant ?? "info"} className="mt-auto">
          {tip.text}
        </InsightBox>
      )}
    </GoalCard>
  );
}
