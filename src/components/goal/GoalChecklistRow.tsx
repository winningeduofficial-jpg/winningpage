// 목표관리 앱 체크리스트 행 — docs/figma-goal/00-INDEX.md §5-4 `ChecklistRow`.
// `{순번, 텍스트, 상태: done | fail | pending}` + 체크/X 20×20 액션 2개. 상태별 규칙(part-07
// §256~260 실측):
//   done    — 텍스트 회색 + 취소선, 체크 버튼 초록 채움(활성), X 버튼 연빨강 아웃라인
//   fail    — 텍스트 회색 + 취소선 + 빨강, 체크 버튼 연초록 아웃라인, X 버튼 빨강 채움(활성)
//   pending — 텍스트 진한 검정, 체크/X 둘 다 연한 아웃라인
//
// ✓/✕는 실 데이터 배선 이후 실제 액션이다(임무 지시 "단계 E" 배선 절) — ✓는 완료 토글
// (PUT), ✕는 삭제(DELETE)다. goal_plan_tasks 스키마(sql/75)에는 done boolean만 있고 "미실행
// (fail)" 상태에 대응하는 컬럼이 없다 — 그래서 실데이터 소비처(StudyPlanRail.jsx)는 status를
// done/pending 2종만 만든다. fail 렌더링·prop 계약 자체는 지우지 않는다(향후 기한 초과 판정
// 등으로 자연스럽게 채울 수 있는 자리이고, 이 컴포넌트만 보면 상태 3종 스펙이 그대로 읽혀야
// 한다). onCheck/onDelete가 없으면(prop 미지정) 버튼은 조용히 no-op이다.
//
// 접근성(코드 검수 §3): ✓/✕ 인디케이터가 둘 다 aria-hidden이고 done/fail이 색+line-through로만
// 구분돼 스크린리더에선 동일하게 읽혔다. 상태 텍스트를 sr-only로 노출하고, done/fail을 시각적으로도
// 구분한다(fail은 취소선 대신 빨간 텍스트). 표시 전용 span을 실제 버튼으로 승격하며 aria-label을
// 추가해 액션의 의미(완료 처리/취소, 삭제)를 아이콘이 아니라 텍스트로도 전달한다.
const struck = { done: true, fail: false, pending: false };
const STATUS_LABEL = { done: "완료", fail: "미실행", pending: "대기" };

export default function GoalChecklistRow({
  index,
  text,
  status = "pending",
  onCheck,
  onDelete,
}) {
  const isDone = status === "done";
  const isFail = status === "fail";

  return (
    <li className="flex h-[2.375rem] items-center justify-between gap-2 rounded-lg bg-white px-3">
      <span
        className={`flex min-w-0 items-center gap-2 truncate text-[0.875rem] leading-[1.4] ${
          isFail
            ? "text-error"
            : struck[status]
              ? "text-ink-sub line-through"
              : "text-ink-strong"
        }`}
      >
        <span className="shrink-0 text-ink-sub">{index}</span>
        <span className="truncate">{text}</span>
        <span className="sr-only">({STATUS_LABEL[status]})</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onCheck}
          aria-label={isDone ? "완료 취소" : "완료 처리"}
          aria-pressed={isDone}
          className={`flex h-5 w-5 items-center justify-center rounded-md border text-[0.625rem] font-bold transition-colors ${
            isDone
              ? "border-transparent bg-[#4CAF6D] text-white"
              : "border-[#B8DFC4] text-transparent"
          }`}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="과제 삭제"
          className={`flex h-5 w-5 items-center justify-center rounded-md border text-[0.625rem] font-bold transition-colors ${
            isFail
              ? "border-transparent bg-error text-white"
              : "border-[#F3C4C4] text-transparent"
          }`}
        >
          ✕
        </button>
      </span>
    </li>
  );
}
