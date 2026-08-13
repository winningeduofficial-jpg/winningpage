import GoalCard from '../GoalCard';

// 우측 레일 "오늘의 학습 순위" 카드(372×342, 행 332×38 pitch 46) — 사이드바 메뉴에서는
// "학습 순위"가 정본에서 제외됐지만(goalNavItems.js 상단 주석) 대시보드 레일 카드는 유지
// 대상이다(작업 지시 §확정사항 4). 본인 행만 주황 강조.
export default function RankingRail({ ranking }) {
  return (
    <GoalCard tone="cream" className="flex flex-col gap-3 px-[1.25rem] py-[1.25rem]">
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">오늘의 학습 순위</h3>
      {ranking.length === 0 ? (
        <p className="text-[0.875rem] leading-[1.4] text-ink-sub">
          아직 오늘 학습 기록을 제출한 학생이 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ranking.map((row, index) => (
            <li
              // rank만 키로 쓰면 "상위 5명 + 내 순위" 블록에서 내가 상위 5명에도
              // 포함돼 같은 rank가 두 번 나올 수 있다(RankingRail 호출부 주석 참고).
              key={`${row.rank}-${index}`}
              className={`flex h-[2.375rem] items-center justify-between rounded-lg bg-white px-4 text-[0.875rem] leading-[1.4] ${
                row.isSelf ? 'font-bold text-[#E27A2F]' : 'text-ink'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-ink-sub">{row.rank}등</span>
                <span className="truncate">{row.name}</span>
              </span>
              <span className="shrink-0">{row.hours}h</span>
            </li>
          ))}
        </ul>
      )}
    </GoalCard>
  );
}
