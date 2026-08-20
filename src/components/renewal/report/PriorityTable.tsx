import ScoreBar from "./ScoreBar";
import StatusBadge from "./StatusBadge";

// 우선순위 표 6행 — 뱃지 / 영역 / 현재·목표 수준 게이지 / 현재 상태 / 필요한 것.
// rows = [...data.learningAxes].sort((a, b) => a.score - b.score) (ReportPageOne 소유).
// 헤더/바디 공용 그리드: 116 / 188 / 237 / 120 / auto (px) → 7.25 / 11.75 / 14.8125 / 7.5rem / 1fr.
const GRID_COLS = "grid-cols-[7.25rem_11.75rem_14.8125rem_7.5rem_1fr]";

type PriorityRow = {
  area?: string;
  name?: string;
  tone?: string;
  badge?: string;
  score: number;
  status?: string;
  need?: string;
};

type PriorityTableProps = {
  rows: PriorityRow[];
};

export default function PriorityTable({ rows }: PriorityTableProps) {
  return (
    // fd-priority-table — QA 행 105: 인쇄 뷰포트(794px)는 lg:을 타지 않아 lg:w-250이 무시되고
    // w-full로 늘어나 보이던 문제. report-print.css가 이 훅으로 동일 폭(62.5rem)을 강제한다.
    <div className="fd-priority-table w-250">
      <div
        className={`grid h-5 ${GRID_COLS} text-base font-semibold leading-5 text-ink`}
      >
        <span>우선순위</span>
        <span>영역</span>
        <span>현재 수준/목표 수준</span>
        <span>현재 상태</span>
        <span>필요한 것</span>
      </div>

      <div className="mt-3.75 flex flex-col gap-4">
        {rows.map((row, index) => {
          const area = row.area ?? row.name;
          return (
            <div
              key={area}
              className={`grid h-7 ${GRID_COLS} items-center ${
                index > 0 ? "border-t border-[#e5e5e5]" : ""
              }`}
            >
              {/* exactOptionalPropertyTypes 대응 — undefined일 때 tone 키 생략(StatusBadge 미수정 범위). */}
              <StatusBadge
                {...(row.tone !== undefined ? { tone: row.tone } : {})}
              >
                {row.badge}
              </StatusBadge>
              <span className="text-base font-normal leading-5 text-ink">
                {area}
              </span>
              {/* 시안 회귀(2026-08-20) — 점수 숫자 표기(F-20)를 폐기하고 게이지 폭을
                  시안 231px(w-57.75, 기본값)로 되돌린다. 숫자가 사라져 막대가 값의 유일한
                  표현이 되므로 decorative를 걷어내 role="img" aria-label 경로를 살린다. */}
              <ScoreBar
                score={row.score}
                {...(row.tone !== undefined ? { tone: row.tone } : {})}
              />
              <span className="text-base font-normal leading-5 text-ink">
                {row.status}
              </span>
              <span className="text-base font-normal leading-5 text-ink">
                {row.need}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
