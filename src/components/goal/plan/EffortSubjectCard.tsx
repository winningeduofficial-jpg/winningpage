import SubjectChip from "@/components/goal/SubjectChip";
import { resolveSubjectId } from "@/components/goal/subjectTokens";

// 나의 노력 과목 카드 — docs/figma-goal/part-10.md #30(빈) / part-11.md #32(채움), 312×451.
//
// 오버플로 재설계(화면별 지침 §2 확정 사항): 시안은 카드 높이 451px 고정 + 문제집 칩 하단 정렬
// 구조라 칩이 5개 이상이면 겹친다(part-11 §192 "칩 5개 이상일 때의 오버플로 규칙 미정의 → 설계
// 필요"). 여기서는 칩 영역을 상단 정렬 + `flex-1 overflow-y-auto`로 바꿔, 카드 높이(451px)는
// 유지하면서 몇 권이 쌓여도 카드가 깨지거나 다른 요소를 침범하지 않게 했다. 완독 스택(선반 바 +
// 캡션)은 칩 개수와 무관하게 항상 카드 최하단에 고정된다(시안 그대로, part-11 §155).
//
// 한글 과목명 → 과목 id 매핑은 subjectTokens.js 정본 헬퍼를 쓴다(코드 검수 §1).
//
// books는 문자열 배열이 아니라 {id, title} 객체 배열이다(실데이터 배선, goalApi.js
// fetchGoalWorkbooks 응답). 진도 갱신 동선이 시안에 없어, 칩을 클릭하면 onEditBook이
// 호출되어 AddWorkbookModal을 수정 모드로 재사용해 연다(Efforts.jsx 판단 지점).

type EffortBook = { id: string | number; title: string };

type EffortSubjectCardProps = {
  subject: string;
  completed?: number;
  books?: EffortBook[];
  onAddBook?: () => void;
  onEditBook?: (book: EffortBook) => void;
};

export default function EffortSubjectCard({
  subject,
  completed,
  books,
  onAddBook,
  onEditBook,
}: EffortSubjectCardProps) {
  const color = resolveSubjectId(subject);
  const hasBooks = Array.isArray(books) && books.length > 0;

  return (
    <div className="flex h-112.75 w-78 shrink-0 flex-col rounded-xl border border-line/60 bg-white px-4.75 py-5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
          {subject}
        </h3>
        <span className="text-[0.875rem] leading-[1.4] text-ink-sub">
          완독 {completed}권
        </span>
      </div>

      {/* 「공부 중인 책」 인셋 박스 — 274×125(part-10 §207~209). */}
      <div className="mt-5.5 flex w-full shrink-0 flex-col gap-2.5 rounded-lg bg-surface-04 p-5">
        <p className="text-[0.875rem] leading-[1.4] text-ink-sub">
          공부 중인 책
        </p>
        <button
          type="button"
          onClick={onAddBook}
          className="flex h-9 w-full items-center justify-center rounded-lg border border-dashed border-line text-[0.8125rem] font-medium text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
        >
          + 문제집 추가
        </button>
      </div>

      {/* 등록된 문제집 칩 리스트 — 274×32(part-11 §142), 상단 정렬 + 스크롤(위 주석 참고). */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {hasBooks && (
          <ul className="flex flex-col gap-2">
            {books.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  onClick={() => onEditBook?.(book)}
                  className="block w-full text-left"
                >
                  <SubjectChip
                    label={book.title}
                    size="sm"
                    color={color}
                    className="w-full! justify-start!"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 완독 책장 선반 — 147×7(part-10 §210), 칩 유무와 무관하게 항상 하단 고정. */}
      <div className="mt-3 flex shrink-0 flex-col items-center gap-2">
        <div className="h-1.75 w-36.75 rounded-full bg-surface-01" />
        <p className="text-[0.75rem] leading-[1.4] text-ink-sub">
          완독하면 여기에 쌓여요
        </p>
      </div>
    </div>
  );
}
