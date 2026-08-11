import StatusBadge from './StatusBadge';
import ScoreBar from './ScoreBar';

// 우선순위 표 6행 — 뱃지 / 영역 / 현재·목표 수준 게이지 / 현재 상태 / 필요한 것.
// rows = [...data.learningAxes].sort((a, b) => a.score - b.score) (ReportPageOne 소유).
// 헤더/바디 공용 그리드: 116 / 188 / 237 / 120 / auto (px) → 7.25 / 11.75 / 14.8125 / 7.5rem / 1fr.
const GRID_COLS = 'grid-cols-[7.25rem_11.75rem_14.8125rem_7.5rem_1fr]';

/*
 * R3(2026-08-11) — 5열 그리드(헤더 포함 실폭 ≈ 62.5rem/1000px)는 모바일에서 가로 스크롤
 * 컨테이너로 두기보다(5개 값을 좌우로 훑어 읽어야 해서 판독성이 떨어진다) 행 단위 카드로
 * 접는다(브리핑 "표는... 행 단위 카드로 접어라"의 선택지). 데스크톱 그리드는 그대로 두고
 * `hidden lg:block` / `lg:hidden` 으로 두 렌더를 완전히 분리한다 — 열 폭 재계산 없이
 * 기존 데스크톱 마크업을 한 글자도 건드리지 않는다.
 * 라벨("현재 상태" · "필요한 것")은 새 문구가 아니라 데스크톱 헤더에 이미 있는 라벨을
 * 그대로 재사용한다.
 */
export default function PriorityTable({ rows }) {
  return (
    <div className="w-full lg:w-[62.5rem]">
      {/* 데스크톱 전용 — 5열 그리드 표.
          fd-wide-only — 인쇄(뷰포트 794px, lg: 미적용)에서도 report-print.css 가 이 훅으로
          강제 표시한다(인쇄는 항상 데스크톱 레이아웃). */}
      <div className="hidden lg:block fd-wide-only">
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

      {/* 모바일 전용 — 행 단위 카드.
          fd-narrow-only — 인쇄에서는 report-print.css 가 이 훅으로 강제 숨김한다. */}
      <div className="flex flex-col gap-3 lg:hidden fd-narrow-only">
        {rows.map((row) => {
          const area = row.area ?? row.name;
          return (
            <div key={area} className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] p-4">
              <div className="flex items-center gap-2">
                <StatusBadge tone={row.tone}>{row.badge}</StatusBadge>
                <span className="text-base font-medium leading-[1.25rem] text-[#525252]">
                  {area}
                </span>
              </div>
              <ScoreBar score={row.score} tone={row.tone} responsive />
              {/* text-base(16px) — 본문 최소 크기. 데스크톱 그리드와 동일 폰트 크기를 유지한다. */}
              <dl className="flex flex-col gap-1 text-base leading-[1.4] text-[#525252]">
                <div className="flex gap-1.5">
                  <dt className="shrink-0 font-medium">현재 상태</dt>
                  <dd>{row.status}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="shrink-0 font-medium">필요한 것</dt>
                  <dd>{row.need}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
