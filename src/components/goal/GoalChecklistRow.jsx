// 목표관리 앱 체크리스트 행 — docs/figma-goal/00-INDEX.md §5-4 `ChecklistRow`.
// `{순번, 텍스트, 상태: done | fail | pending}` + 체크/X 20×20 액션 2개. 상태별 규칙(part-07
// §256~260 실측):
//   done    — 텍스트 회색 + 취소선, 체크 버튼 초록 채움(활성), X 버튼 연빨강 아웃라인
//   fail    — 텍스트 회색 + 취소선 + 빨강, 체크 버튼 연초록 아웃라인, X 버튼 빨강 채움(활성)
//   pending — 텍스트 진한 검정, 체크/X 둘 다 연한 아웃라인
// 체크/X는 현재 표시 전용이다(모달·저장 로직은 다음 단계 범위) — 클릭 핸들러는 아직 없다.
//
// 접근성(코드 검수 §3): ✓/✕ 인디케이터가 둘 다 aria-hidden이고 done/fail이 색+line-through로만
// 구분돼 스크린리더에선 동일하게 읽혔다. 상태 텍스트를 sr-only로 노출하고, done/fail을 시각적으로도
// 구분한다(fail은 취소선 대신 빨간 텍스트).
const struck = { done: true, fail: false, pending: false };
const STATUS_LABEL = { done: '완료', fail: '미실행', pending: '대기' };

export default function GoalChecklistRow({ index, text, status = 'pending' }) {
  const isDone = status === 'done';
  const isFail = status === 'fail';

  return (
    <li className="flex h-[2.375rem] items-center justify-between gap-2 rounded-lg bg-white px-3">
      <span
        className={`flex min-w-0 items-center gap-2 truncate text-[0.875rem] leading-[1.4] ${
          isFail ? 'text-error' : struck[status] ? 'text-ink-sub line-through' : 'text-ink-strong'
        }`}
      >
        <span className="shrink-0 text-ink-sub">{index}</span>
        <span className="truncate">{text}</span>
        <span className="sr-only">({STATUS_LABEL[status]})</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 items-center justify-center rounded-md border text-[0.625rem] font-bold ${
            isDone ? 'border-transparent bg-[#4CAF6D] text-white' : 'border-[#B8DFC4] text-transparent'
          }`}
        >
          ✓
        </span>
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 items-center justify-center rounded-md border text-[0.625rem] font-bold ${
            isFail ? 'border-transparent bg-error text-white' : 'border-[#F3C4C4] text-transparent'
          }`}
        >
          ✕
        </span>
      </span>
    </li>
  );
}
