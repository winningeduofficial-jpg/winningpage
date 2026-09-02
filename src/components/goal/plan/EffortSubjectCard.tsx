import BookStack from "@/components/goal/plan/BookStack";
import EffortWorkbookRow, {
  type EffortBook,
} from "@/components/goal/plan/EffortWorkbookRow";
import { resolveSubjectId } from "@/components/goal/subjectTokens";

// 나의 노력 과목 카드 — Figma 4026:6046(디자이너 시안 재구현). 312×507.
//
// 이전 텍스트 목록(제목 · 진도 · 달성률 한 줄)을 시안대로 인라인 편집 UI로 바꾼다 —
// EffortWorkbookRow가 책 1권당 제목/현재·전체 페이지/진행바/(100%면) 완독 버튼을
// 전부 담당한다. "+ 문제집 추가"는 그대로 목록 아래에 유지한다. 인셋 박스는 고정
// 높이를 두지 않고 내용(책 권수)에 따라 자란다 — 시안 실측도 책 1권일 때 194px,
// 완독 버튼이 뜬 상태일 때 252px로 서로 다르다(고정값이 아니라는 근거).
//
// 완독 책장: BookStack이 shelved_at이 채워진(=학생이 "완독! 책장에 꽂기"를 누른)
// 책만 그린다. status='done'이어도 아직 안 꽂았으면 공부 중인 책 목록에 완독 버튼과
// 함께 남는다(수동 전이, EffortWorkbookRow 주석 참고). 캡션 "완독하면 여기에
// 쌓여요"는 시안대로 책이 있어도 항상 표시한다.
//
// 한글 과목명 → 과목 id 매핑은 subjectTokens.ts 정본 헬퍼를 쓴다(코드 검수 §1).
// books/completedBooks는 문자열 배열이 아니라 {id, title, ...} 객체 배열이다(실데이터
// 배선, goalApi.ts fetchGoalWorkbooks 응답).

type CompletedBook = {
  id: string | number;
  title: string;
  shelvedAt: string | null;
};

type EffortSubjectCardProps = {
  subject: string;
  completed?: number;
  books?: EffortBook[];
  completedBooks?: CompletedBook[];
  /** 방금 꽂힌 책 id — BookStack 드롭 애니메이션용. */
  droppingBookId?: string | number | null;
  onAddBook?: () => void;
  onUpdateBook?: (
    id: string | number,
    patch: { title?: string; currentPage?: number; totalPages?: number },
  ) => Promise<boolean>;
  onDeleteBook?: (id: string | number) => Promise<boolean>;
  onShelveBook?: (id: string | number) => Promise<boolean>;
};

export default function EffortSubjectCard({
  subject,
  completed,
  books,
  completedBooks,
  droppingBookId,
  onAddBook,
  onUpdateBook,
  onDeleteBook,
  onShelveBook,
}: EffortSubjectCardProps) {
  const subjectId = resolveSubjectId(subject);
  const hasBooks = Array.isArray(books) && books.length > 0;
  const hasCompletedBooks =
    Array.isArray(completedBooks) && completedBooks.length > 0;

  return (
    <div className="flex h-126.75 w-full min-w-0 flex-col rounded-xl border border-surface-01 bg-white px-4.75 py-5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[1.25rem] font-semibold leading-[1.4] text-ink">
          {subject}
        </h3>
        <span className="text-[1rem] leading-[1.4] text-ink-natural">
          완독 {completed}권
        </span>
      </div>

      {/* 「공부 중인 책」 인셋 박스 — 목록+추가 버튼을 함께 담는다(위 주석 참고). */}
      <div className="mt-5.5 flex w-full shrink-0 flex-col gap-3 rounded-xl border border-surface-01 bg-goal-card p-5">
        <p className="text-[1rem] font-semibold leading-[1.4] text-ink-natural">
          공부 중인 책
        </p>

        {hasBooks && (
          <div className="flex max-h-70 flex-col gap-3 overflow-y-auto pr-0.5">
            {books.map((book) => (
              <EffortWorkbookRow
                key={book.id}
                book={book}
                subject={subjectId}
                onUpdate={onUpdateBook ?? (async () => false)}
                onDelete={onDeleteBook ?? (async () => false)}
                onShelve={onShelveBook ?? (async () => false)}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onAddBook}
          className="flex h-9 w-full shrink-0 items-center justify-center rounded-md border border-dashed border-surface-01 text-[1rem] font-medium text-ink-natural transition-colors hover:border-ink-strong hover:text-ink-strong"
        >
          + 문제집 추가
        </button>
      </div>

      {/* 완독 책장 — BookStack(1권 이상)은 스크롤 가능한 flex-1 영역에, 선반 바+캡션은
          시안대로 책 유무와 무관하게 항상 표시한다. */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        {/* 스크롤 컨테이너가 그림자(아래 4px 오프셋+4px 블러)를 잘라내지 않도록
            하단·좌우 여백을 둔다 — 여백 없이는 맨 아래 책의 그림자가 통째로 사라진다. */}
        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-1 pb-2.5">
          {hasCompletedBooks && (
            <BookStack
              books={completedBooks}
              subject={subjectId}
              droppingId={droppingBookId ?? null}
            />
          )}
        </div>
        <div className="mt-2 flex shrink-0 flex-col items-center gap-2">
          <div className="h-1.75 w-36.75 shrink-0 rounded bg-surface-01" />
          <p className="text-[1rem] leading-[1.4] text-ink-natural">
            완독하면 여기에 쌓여요
          </p>
        </div>
      </div>
    </div>
  );
}
