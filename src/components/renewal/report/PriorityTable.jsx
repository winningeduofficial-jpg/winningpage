import StatusBadge from './StatusBadge';
import ScoreBar from './ScoreBar';

// 우선순위 표 6행 — 뱃지 / 영역 / 현재·목표 수준 게이지 / 현재 상태 / 필요한 것.
// rows = [...data.learningAxes].sort((a, b) => a.score - b.score) (ReportPageOne 소유).
// 헤더/바디 공용 그리드: 116 / 188 / 237 / 120 / auto (px) → 7.25 / 11.75 / 14.8125 / 7.5rem / 1fr.
const GRID_COLS = 'grid-cols-[7.25rem_11.75rem_14.8125rem_7.5rem_1fr]';

export default function PriorityTable({ rows }) {
  return (
    <div className="w-[62.5rem]">
      <div
        className={`grid h-5 ${GRID_COLS} text-base font-semibold leading-[1.25rem] text-[#525252]`}
      >
        <span>우선순위</span>
        <span>영역</span>
        <span>현재 수준/목표 수준</span>
        <span>현재 상태</span>
        <span>필요한 것</span>
      </div>

      <div className="mt-[0.9375rem] flex flex-col gap-4">
        {rows.map((row, index) => {
          const area = row.area ?? row.name;
          return (
            <div
              key={area}
              className={`grid h-7 ${GRID_COLS} items-center ${
                index > 0 ? 'border-t border-[#e5e5e5]' : ''
              }`}
            >
              <StatusBadge tone={row.tone}>{row.badge}</StatusBadge>
              <span className="text-base font-normal leading-[1.25rem] text-[#525252]">
                {area}
              </span>
              <ScoreBar score={row.score} tone={row.tone} />
              <span className="text-base font-normal leading-[1.25rem] text-[#525252]">
                {row.status}
              </span>
              <span className="text-base font-normal leading-[1.25rem] text-[#525252]">
                {row.need}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
