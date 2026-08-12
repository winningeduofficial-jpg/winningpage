import SubjectChip from '../SubjectChip';
import { resolveSubjectId } from '../subjectTokens';

// 나의 노력 과목 카드 — docs/figma-goal/part-10.md #30(빈) / part-11.md #32(채움), 312×451.
//
// 오버플로 재설계(화면별 지침 §2 확정 사항): 시안은 카드 높이 451px 고정 + 문제집 칩 하단 정렬
// 구조라 칩이 5개 이상이면 겹친다(part-11 §192 "칩 5개 이상일 때의 오버플로 규칙 미정의 → 설계
// 필요"). 여기서는 칩 영역을 상단 정렬 + `flex-1 overflow-y-auto`로 바꿔, 카드 높이(451px)는
// 유지하면서 몇 권이 쌓여도 카드가 깨지거나 다른 요소를 침범하지 않게 했다. 완독 스택(선반 바 +
// 캡션)은 칩 개수와 무관하게 항상 카드 최하단에 고정된다(시안 그대로, part-11 §155).
//
// 한글 과목명 → 과목 id 매핑은 subjectTokens.js 정본 헬퍼를 쓴다(코드 검수 §1).

export default function EffortSubjectCard({ subject, completed, books, onAddBook }) {
  const color = resolveSubjectId(subject);
  const hasBooks = Array.isArray(books) && books.length > 0;

  return (
    <div className="flex h-[28.1875rem] w-[19.5rem] shrink-0 flex-col rounded-xl border border-line/60 bg-white px-[1.1875rem] py-5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">{subject}</h3>
        <span className="text-[0.875rem] leading-[1.4] text-ink-sub">완독 {completed}권</span>
      </div>

      {/* 「공부 중인 책」 인셋 박스 — 274×125(part-10 §207~209). */}
      <div className="mt-[1.375rem] flex w-full shrink-0 flex-col gap-[0.625rem] rounded-lg bg-surface-04 p-[1.25rem]">
        <p className="text-[0.875rem] leading-[1.4] text-ink-sub">공부 중인 책</p>
        <button
          type="button"
          onClick={onAddBook}
          className="flex h-[2.25rem] w-full items-center justify-center rounded-lg border border-dashed border-line text-[0.8125rem] font-medium text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
        >
          + 문제집 추가
        </button>
      </div>

      {/* 등록된 문제집 칩 리스트 — 274×32(part-11 §142), 상단 정렬 + 스크롤(위 주석 참고). */}
      <div className="mt-[0.75rem] min-h-0 flex-1 overflow-y-auto">
        {hasBooks && (
          <ul className="flex flex-col gap-2">
            {books.map((title, index) => (
              <li key={`${title}-${index}`}>
                <SubjectChip label={title} size="sm" color={color} className="!w-full !justify-start" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 완독 책장 선반 — 147×7(part-10 §210), 칩 유무와 무관하게 항상 하단 고정. */}
      <div className="mt-3 flex shrink-0 flex-col items-center gap-2">
        <div className="h-[0.4375rem] w-[9.1875rem] rounded-full bg-surface-01" />
        <p className="text-[0.75rem] leading-[1.4] text-ink-sub">완독하면 여기에 쌓여요</p>
      </div>
    </div>
  );
}
