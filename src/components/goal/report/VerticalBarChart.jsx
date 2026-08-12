// 리포트 세로 막대 차트 — docs/figma-goal/00-INDEX.md §5-4 `VerticalBarChart`, part-11 §240~244.
// 주간(요일 7개) / 월간(주차 4개) 겸용. 시안 실측 막대 폭 23px(1.4375rem).
//
// recharts를 쓰지 않고 flex/div로 직접 그린다 — AchievementChart.jsx(대시보드)의 recharts 패턴은
// "그룹 막대 다계열" 차트에 맞는 선택이고, 여긴 확정 사항 §"0값 막대는 완전 미표시가 아니라 4px
// 회색 스텁으로 렌더"를 정밀 제어해야 하는 단일 계열 미니 차트라 recharts의 데이터 도메인 기반
// 렌더링보다 직접 픽셀(%) 제어가 더 간단하고 명확하다(판단 지점 — 작업 보고 참고).
//
// 막대 높이는 항상 "이 차트 내 최댓값 대비 비율"로 계산한다(값 하드코딩 금지 원칙). 0값만
// 예외적으로 고정 4px(0.25rem) 회색 스텁으로 그려 "데이터가 없다"가 아니라 "값이 0"임을 구분한다.
export default function VerticalBarChart({ bars, unit = 'h', heightRem = 5 }) {
  const max = Math.max(...bars.map((bar) => bar.value), 0.0001);

  return (
    <div className="flex items-stretch justify-between gap-2" style={{ height: `${heightRem}rem` }}>
      {bars.map((bar) => {
        const isZero = bar.value === 0;
        const pct = isZero ? 0 : (bar.value / max) * 100;

        return (
          <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[0.6875rem] leading-[1.2] text-ink-sub">
              {bar.value}
              {unit}
            </span>
            <div className="flex w-full flex-1 items-end justify-center">
              <div
                aria-hidden="true"
                className={`w-[1.4375rem] rounded-t-md ${isZero ? 'bg-surface-01' : 'bg-accent/35'}`}
                style={{ height: isZero ? '0.25rem' : `${Math.max(pct, 6)}%` }}
              />
            </div>
            <span className="text-[0.75rem] font-medium leading-[1.3] text-ink-strong">{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}
