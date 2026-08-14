// 목표관리 앱 진행 바 — docs/figma-goal/00-INDEX.md §5-4 `ProgressBar`.
//
// ⚠︎ 채움 폭은 반드시 `value/max` 비례 계산으로만 정한다. part-05/07 "구현 노트"가 공통으로
// 지적하듯 시안의 채움 rect px값은 라벨 %와 전면 불일치한다(예: 이상 목표 44%p 채움인데 라벨은
// 54%). 시안 px는 절대 하드코딩하지 말 것 — 이 컴포넌트는 그 규칙을 강제하는 유일한 지점이다.
//
// thickness: 두께(rem 문자열). 대시보드 굵은 게이지 0.75rem(12px), 레일 합격률 게이지 0.375rem(6px).
//
// `flex-1`은 기본으로 붙이지 않는다(코드 검수 §7). flex row 부모(라벨 — 바 — % 3분할)에선
// 남은 가로 공간을 채우기 위해 필요하지만, flex column 부모에 그대로 두면 flex-basis:0%가
// 세로(main axis) 크기 계산에 끼어들어 "세로로 늘어나려는" 의도치 않은 동작이 된다. 필요한
// 호출부(row 부모)는 className="flex-1"을 직접 넘긴다.
export default function GoalProgressBar({
  value = 0,
  max = 100,
  thickness = "0.75rem",
  trackClassName = "bg-surface-01",
  fillClassName = "bg-surface-02",
  className = "",
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={`w-full min-w-0 rounded-full ${trackClassName} ${className}`}
      style={{ height: thickness }}
    >
      <div
        className={`h-full rounded-full ${fillClassName}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
