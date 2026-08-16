import DeltaBadge from "@/components/goal/DeltaBadge";
import GoalCardHeader from "@/components/goal/GoalCardHeader";
import GoalEmptyState from "@/components/goal/GoalEmptyState";

const COLUMNS = [
  { key: "term", label: "회차" },
  { key: "korean", label: "국어" },
  { key: "math", label: "수학" },
  { key: "english", label: "영어" },
  { key: "science", label: "탐구" },
  { key: "average", label: "평균" },
];

// 성적 관리 표(#35, 1018px 카드) — 내신·모의고사 공용. 직전 회차가 없는 첫 행은 델타 배지를
// 표시하지 않는다(part-12 §233).
//
// 결함4 대응: 이전엔 `row.delta`를 목업이 직접 들고 있다고 가정했지만 mockGrades.*.rows 어디에도
// 그 필드가 없어 배지가 한 번도 렌더되지 않았다. 목업에 수동 델타 필드를 추가하는 대신 **인접 행의
// `average` 차이로 델타를 파생**한다 — 회차가 늘어나도 항상 정확하고, 값과 델타가 어긋날 일이
// 없다. 내신은 등급이라 값이 낮을수록 좋고 모의고사는 백분위라 높을수록 좋으므로, 어느 지표인지는
// 호출부가 `lowerIsBetter`로 명시하게 한다(그 편이 "화살표 방향≠색상 의미"를 분리해 둔
// DeltaBadge의 설계 의도와 맞다). 호출부(pages/goal/Grades.jsx)가 prop을 명시하는 것이 정본이고,
// 아래 `title` 문자열 추론은 prop 누락 시를 대비한 방어용 폴백일 뿐이다(카피가 바뀌면 조용히
// 깨질 수 있어 신뢰하지 말 것).
//
// 행 수정/삭제 UI는 시안에 없다(part-12 §235) — 이번 범위에서 의도적으로 미구현(주석으로 남김).
// 0회차 빈 상태 시안도 없어(part-12 §245) `GoalEmptyState`로 근사한다(추정).
function inferLowerIsBetter(title?: string) {
  return typeof title === "string" && title.includes("내신");
}

// goalGrades.js toTableRows() 반환 원소.
type GoalTableRow = {
  term: string;
  korean?: number | string;
  math?: number | string;
  english?: number | string;
  science?: number | string;
  average: number;
};

type GoalTableProps = {
  title?: string;
  rows: GoalTableRow[];
  onAddRound?: () => void;
  lowerIsBetter?: boolean;
};

export default function GoalTable({
  title,
  rows,
  onAddRound,
  lowerIsBetter,
}: GoalTableProps) {
  const isLowerBetter = lowerIsBetter ?? inferLowerIsBetter(title);

  return (
    <div className="w-full max-w-[63.625rem] rounded-2xl bg-goal-cardTone-neutral px-6 py-6">
      <GoalCardHeader
        title={title}
        action={
          <button
            type="button"
            onClick={onAddRound}
            className="flex h-[2.875rem] items-center rounded-lg border border-line bg-white px-4 text-[0.8125rem] font-semibold leading-[1.4] text-ink-strong transition-colors hover:bg-surface-04"
          >
            + 회차 추가
          </button>
        }
      />

      {rows.length === 0 ? (
        <div className="mt-5">
          {/* GoalEmptyState(다른 UoW 소유)는 onAdd undefined 미허용 — 없으면 prop 자체를 생략 */}
          <GoalEmptyState
            message="아직 등록된 회차가 없습니다. 첫 회차를 추가해보세요."
            {...(onAddRound ? { onAdd: onAddRound } : {})}
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[45rem] border-collapse text-left text-[0.8125rem] leading-[1.4]">
            <thead>
              <tr className="border-b border-[#EDEDED] text-ink-sub">
                {COLUMNS.map((column) => (
                  <th key={column.key} className="py-3 pr-3 font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                // index > 0 이면 rows[index - 1] 은 항상 존재
                const prevAverage = index > 0 ? rows[index - 1]!.average : null;
                const diff =
                  prevAverage != null ? row.average - prevAverage : null;
                const direction =
                  diff == null || diff === 0
                    ? "flat"
                    : diff > 0
                      ? "up"
                      : "down";
                const isImprovement =
                  diff != null &&
                  diff !== 0 &&
                  (isLowerBetter ? diff < 0 : diff > 0);
                const tone =
                  diff == null || diff === 0
                    ? "neutral"
                    : isImprovement
                      ? "positive"
                      : "negative";

                return (
                  <tr key={row.term} className="text-ink">
                    <td className="py-3 pr-3 font-medium text-ink-strong">
                      {row.term}
                    </td>
                    <td className="py-3 pr-3">{row.korean}</td>
                    <td className="py-3 pr-3">{row.math}</td>
                    <td className="py-3 pr-3">{row.english}</td>
                    <td className="py-3 pr-3">{row.science}</td>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2 font-semibold text-ink-strong">
                        {diff != null && (
                          <DeltaBadge
                            value={Math.abs(diff).toFixed(2)}
                            direction={direction}
                            tone={tone}
                          />
                        )}
                        {row.average}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
