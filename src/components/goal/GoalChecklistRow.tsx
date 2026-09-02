// 목표관리 앱 체크리스트 행 — docs/figma-goal/00-INDEX.md §5-4 `ChecklistRow`.
// `{순번, 텍스트, 상태: done | fail | pending}` + 체크/X 20×20 액션 2개. 상태별 규칙(part-07
// §256~260 실측):
//   done    — 텍스트 회색 + 취소선, 체크 버튼 초록 채움(활성), X 버튼 연빨강 아웃라인
//   fail    — 텍스트 회색 + 취소선 + 빨강, 체크 버튼 연초록 아웃라인, X 버튼 빨강 채움(활성)
//   pending — 텍스트 진한 검정, 체크/X 둘 다 연한 아웃라인
//
// ✓/✕는 실 데이터 배선 액션이다 — ✓는 done↔pending 토글, ✕는 fail↔pending 토글이다
// (goal_plan_tasks.status 3상태, QA 행305). 둘 다 PUT(status 전환)이고 DELETE가 아니다 —
// "미달성 표시"는 삭제가 아니라 상태 전환이라는 게 이번 수정의 핵심이다. 다음 status
// 계산은 src/lib/goalPlanUtils.ts의 nextPlanTaskStatus(순수 함수, 테스트됨)가 하고, 이
// 컴포넌트는 그 결과로 이미 갱신된 status를 그대로 렌더만 한다. onCheck/onFail이 없으면
// (prop 미지정) 버튼은 조용히 no-op이다.
//
// 접근성(코드 검수 §3): ✓/✕ 인디케이터가 둘 다 aria-hidden이고 done/fail이 색+line-through로만
// 구분돼 스크린리더에선 동일하게 읽혔다. 상태 텍스트를 sr-only로 노출하고, done/fail을 시각적으로도
// 구분한다(fail은 취소선 대신 빨간 텍스트). 표시 전용 span을 실제 버튼으로 승격하며 aria-label을
// 추가해 액션의 의미(완료 처리/취소, 미달성 처리/취소)를 아이콘이 아니라 텍스트로도 전달한다.
//
// 행284 BUG 수정: X 버튼이 비활성(pending/done)일 때 글리프가 text-transparent라 아예
// 안 보여 장식 무늬처럼 보였다("클릭하면 사라짐" QA 오인의 실제 원인) — 테두리와 같은
// 톤의 옅은 텍스트 색으로 바꿔 항상 눈에 보이는 X로 렌더한다.
const struck: Record<string, boolean> = {
  done: true,
  fail: false,
  pending: false,
};
const STATUS_LABEL: Record<string, string> = {
  done: "완료",
  fail: "미실행",
  pending: "대기",
};

type GoalChecklistRowProps = {
  index?: number;
  text?: string;
  // 연결된 문제집 캡션(QA 행286-B, 선택) — "책제목 p.10–20" 형태. 없으면(undefined)
  // 캡션 줄 자체를 렌더하지 않아 기존 단일 행 높이가 그대로 유지된다.
  caption?: string;
  status?: "done" | "fail" | "pending";
  onCheck?: () => void;
  onFail?: () => void;
};

export default function GoalChecklistRow({
  index,
  text,
  caption,
  status = "pending",
  onCheck,
  onFail,
}: GoalChecklistRowProps) {
  const isDone = status === "done";
  const isFail = status === "fail";

  return (
    <li
      className={`flex min-h-9.5 items-center justify-between gap-2 rounded-lg bg-white px-3 ${caption ? "py-1.5" : ""}`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
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
        {caption && (
          <span className="truncate pl-[1.375rem] text-[0.75rem] leading-[1.4] text-ink-sub">
            {caption}
          </span>
        )}
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
          onClick={onFail}
          aria-label={isFail ? "미달성 취소" : "미달성 처리"}
          aria-pressed={isFail}
          className={`flex h-5 w-5 items-center justify-center rounded-md border text-[0.625rem] font-bold transition-colors ${
            isFail
              ? "border-transparent bg-error text-white"
              : "border-[#F3C4C4] text-error/60"
          }`}
        >
          ✕
        </button>
      </span>
    </li>
  );
}
