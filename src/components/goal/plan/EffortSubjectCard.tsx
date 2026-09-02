import BookStack from "@/components/goal/plan/BookStack";
import { resolveSubjectId } from "@/components/goal/subjectTokens";

// 나의 노력 과목 카드 — docs/figma-goal/part-10.md #30(빈) / part-11.md #32(채움), 312×451.
//
// 인셋 박스 재설계(QA 행298): 시안(part-11 §207~209)은 「공부 중인 책」 인셋 박스 안에
// "+ 문제집 추가" 버튼만 있고 등록된 책 목록은 박스 밖 별도 칩 리스트였다 — 제목만 보여
// 진도(현재/전체 페이지·달성률)를 알 수 없었다. 이제 그 목록을 인셋 박스 **안**으로 옮기고
// "제목 · 현재p/전체p · 달성률N%" 텍스트 행으로 바꾼다. "+ 문제집 추가" 버튼은 그대로 목록
// 아래에 둔다. 박스 자체는 고정 높이(125px)를 버리고 내부 목록만 `max-h + overflow-y-auto`로
// 감싸 몇 권이 쌓여도 버튼이 밀려나지 않게 한다(오버플로 재설계, 기존 §2 판단과 동일 원칙을
// 인셋 박스 내부에 적용).
//
// 완독 책장(QA 행282): 예전엔 선반 바 + "완독하면 여기에 쌓여요" 캡션뿐이라 완독 책이 몇 권
// 쌓였는지 시각적으로 전혀 안 보였다. BookStack(plan/BookStack.tsx)이 실제 책이 쌓이는
// 모양을 그린다 — 완독 0권일 때만 기존 캡션을 유지하고, 1권 이상이면 그 자리에 스택을 그린다.
// 선반 바(h-1.75 w-36.75)는 완독 권수와 무관하게 항상 카드 최하단에 남는다(시안의 "선반"
// 요소 유지, part-10 §210).
//
// 한글 과목명 → 과목 id 매핑은 subjectTokens.js 정본 헬퍼를 쓴다(코드 검수 §1).
//
// books/completedBooks는 문자열 배열이 아니라 {id, title, ...} 객체 배열이다(실데이터 배선,
// goalApi.js fetchGoalWorkbooks 응답). 진도 갱신 동선이 시안에 없어, 목록 행을 클릭하면
// onEditBook이 호출되어 AddWorkbookModal을 수정 모드로 재사용해 연다(Efforts.jsx 판단 지점).

type EffortBook = {
  id: string | number;
  title: string;
  // Efforts.tsx의 Workbook과 동일하게 null 가능(서버 실값).
  currentPage: number | null;
  totalPages: number | null;
};

type CompletedBook = { id: string | number; title: string };

type EffortSubjectCardProps = {
  subject: string;
  completed?: number;
  books?: EffortBook[];
  completedBooks?: CompletedBook[];
  onAddBook?: () => void;
  onEditBook?: (book: EffortBook) => void;
};

// 달성률(%) — totalPages가 0/null이면(방어적 상황, DB CHECK상 실제로는 항상 >0) 0%로 접는다.
function achievementRate(book: EffortBook) {
  const total = book.totalPages ?? 0;
  if (total <= 0) return 0;
  const current = book.currentPage ?? 0;
  return Math.min(100, Math.round((current / total) * 100));
}

export default function EffortSubjectCard({
  subject,
  completed,
  books,
  completedBooks,
  onAddBook,
  onEditBook,
}: EffortSubjectCardProps) {
  const color = resolveSubjectId(subject);
  const hasBooks = Array.isArray(books) && books.length > 0;
  const hasCompletedBooks =
    Array.isArray(completedBooks) && completedBooks.length > 0;

  return (
    <div className="flex h-112.75 w-full min-w-0 flex-col rounded-xl border border-line/60 bg-white px-4.75 py-5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
          {subject}
        </h3>
        <span className="text-[0.875rem] leading-[1.4] text-ink-sub">
          완독 {completed}권
        </span>
      </div>

      {/* 「공부 중인 책」 인셋 박스 — 목록+추가 버튼을 함께 담는다(위 주석 참고). */}
      <div className="mt-5.5 flex w-full shrink-0 flex-col gap-2.5 rounded-lg bg-surface-04 p-5">
        <p className="text-[0.875rem] leading-[1.4] text-ink-sub">
          공부 중인 책
        </p>

        {hasBooks && (
          <ul className="flex max-h-20 flex-col gap-1.5 overflow-y-auto pr-0.5">
            {books.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  onClick={() => onEditBook?.(book)}
                  className="block w-full truncate text-left text-[0.75rem] leading-[1.4] text-ink-sub transition-colors hover:text-ink-strong"
                >
                  {`${book.title} · ${book.currentPage ?? 0}p/${book.totalPages ?? 0}p · 달성률 ${achievementRate(book)}%`}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onAddBook}
          className="flex h-9 w-full shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-[0.8125rem] font-medium text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
        >
          + 문제집 추가
        </button>
      </div>

      {/* 완독 책장 — BookStack(1권 이상) 또는 안내 캡션(0권), 선반 바는 항상 유지. */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-end gap-1.5">
        {hasCompletedBooks && (
          <BookStack books={completedBooks} subject={color} />
        )}
        <div className="h-1.75 w-36.75 shrink-0 rounded-full bg-surface-01" />
        {!hasCompletedBooks && (
          <p className="text-[0.75rem] leading-[1.4] text-ink-sub">
            완독하면 여기에 쌓여요
          </p>
        )}
      </div>
    </div>
  );
}
