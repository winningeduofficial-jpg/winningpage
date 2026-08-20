import ScoreBar from "./ScoreBar";
import StatusBadge from "./StatusBadge";

// 우선순위 표 6행 — 뱃지 / 영역 / 현재·목표 수준 게이지 / 현재 상태 / 필요한 것.
// rows = [...data.learningAxes].sort((a, b) => a.score - b.score) (ReportPageOne 소유).
// 헤더 그리드: 116 / 188 / 237 / 120 / auto (px) — 시안 헤더 라벨 x(60/176/364/601/721).
// 데이터 행 그리드는 헤더와 다르다(시안 A4-3 실측): 게이지가 헤더 라벨보다 왼쪽(x310)에서
// 시작한다 — 영역 열 134px / 게이지 열 291px(바 231 + 우측 여백 60).
const GRID_COLS = "grid-cols-[7.25rem_11.75rem_14.8125rem_7.5rem_1fr]";
const ROW_GRID_COLS = "grid-cols-[7.25rem_8.375rem_18.1875rem_7.5rem_1fr]";

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
              className={`grid h-7 ${ROW_GRID_COLS} items-center ${
                index > 0 ? "border-t border-[#e5e5e5]" : ""
              }`}
            >
              {/* exactOptionalPropertyTypes 대응 — undefined일 때 tone 키 생략(StatusBadge 미수정 범위).
                  justify-self-start — 그리드 셀 기본 stretch가 칩을 열 폭(116px)까지 늘리는 것을
                  막아 시안처럼 내용 폭(56px) 필로 유지한다. */}
              <StatusBadge
                className="justify-self-start"
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
