import { useState } from "react";
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
// 행 수정/삭제 UI는 시안에 없었다(part-12 §235). 성적관리 행322(팀장 지시)로 이번에 추가한다 —
// 시안 근거가 없어 배치·문구는 house 톤(다른 카드의 텍스트 버튼)에 맞춰 최소한으로 근사한다.
// onEditRow/onDeleteRow 둘 다 없으면(prop 자체를 생략) 액션 열이 렌더되지 않아 기존
// 행 수정/삭제 없음 화면과 100% 동일하다 — 이 표를 재사용하는 다른 호출부에 영향 없음.
// 삭제는 되돌릴 수 없어 인라인 2단계 확인(먼저 "삭제" → "정말 삭제?" 클릭까지 2번 눌러야
// 실제 삭제)으로 오클릭을 막는다. 클릭 한 번짜리 브라우저 confirm()도 대안이지만, 이 표
// 자체가 house 스타일 텍스트 버튼 패턴을 이미 쓰고 있어 같은 패턴을 유지한다(판단 지점).
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
  onEditRow?: (term: string) => void;
  // 삭제 자체는 부모(react-query invalidate 소유)가 실행한다 — 이 컴포넌트는 2단계
  // 확인 UI만 소유하고, 확정 클릭에서 곧장 onDeleteRow를 호출한다.
  onDeleteRow?: (term: string) => void;
};

export default function GoalTable({
  title,
  rows,
  onAddRound,
  lowerIsBetter,
  onEditRow,
  onDeleteRow,
}: GoalTableProps) {
  const isLowerBetter = lowerIsBetter ?? inferLowerIsBetter(title);
  const hasActions = Boolean(onEditRow || onDeleteRow);
  // 삭제 2단계 확인 중인 행의 term. 한 번에 한 행만 확인 상태를 갖는다(다른 행 클릭·행
  // 추가 등 다른 조작이 끼어들면 자동으로 풀리는 게 안전하다 — 별도 blur 핸들링 없이
  // rows가 갱신되면(성공적으로 삭제되면) 이 term도 배열에서 사라져 자연히 무의미해진다).
  const [confirmingTerm, setConfirmingTerm] = useState<string | null>(null);

  return (
    <div className="w-full max-w-254.5 rounded-2xl bg-goal-cardTone-neutral px-6 py-6">
      <GoalCardHeader
        title={title}
        action={
          <button
            type="button"
            onClick={onAddRound}
            className="flex h-11.5 items-center rounded-lg border border-line bg-white px-4 text-[0.8125rem] font-semibold leading-[1.4] text-ink-strong transition-colors hover:bg-surface-04"
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
          <table className="w-full min-w-180 border-collapse text-left text-[0.8125rem] leading-[1.4]">
            <thead>
              <tr className="border-b border-[#EDEDED] text-ink-sub">
                {COLUMNS.map((column) => (
                  <th key={column.key} className="py-3 pr-3 font-medium">
                    {column.label}
                  </th>
                ))}
                {hasActions && (
                  <th className="py-3 pl-3 font-medium">
                    <span className="sr-only">작업</span>
                  </th>
                )}
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
                    {hasActions && (
                      <td className="py-3 pl-3">
                        {confirmingTerm === row.term ? (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmingTerm(null);
                                onDeleteRow?.(row.term);
                              }}
                              className="text-[0.8125rem] font-semibold text-error hover:underline"
                            >
                              정말 삭제
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingTerm(null)}
                              className="text-[0.8125rem] text-ink-sub hover:underline"
                            >
                              취소
                            </button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-3 whitespace-nowrap">
                            {onEditRow && (
                              <button
                                type="button"
                                onClick={() => onEditRow(row.term)}
                                className="text-[0.8125rem] text-ink-sub hover:text-ink-strong hover:underline"
                              >
                                수정
                              </button>
                            )}
                            {onDeleteRow && (
                              <button
                                type="button"
                                onClick={() => setConfirmingTerm(row.term)}
                                className="text-[0.8125rem] text-ink-sub hover:text-error hover:underline"
                              >
                                삭제
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    )}
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
