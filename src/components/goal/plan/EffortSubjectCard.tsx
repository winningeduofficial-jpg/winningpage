import GoalCard from "@/components/goal/GoalCard";
import BookStack from "@/components/goal/plan/BookStack";
import EffortWorkbookRow, {
  type EffortBook,
} from "@/components/goal/plan/EffortWorkbookRow";
import { resolveSubjectId } from "@/components/goal/subjectTokens";

// 나의 노력 과목 카드 — Figma 4026:6046(디자이너 시안 재구현).
//
// 리뷰 반영(impeccable 디자인 리뷰, 2026-09-02): 312×507 고정 높이를 그대로 rem
// 환산해 쓰면 문제집이 여러 권이거나 완독 책장이 쌓일 때 카드 안에서 잘려 실제
// 화면이 깨졌다("픽셀 복제" 지적). 카드는 이제 content-driven(h-full flex flex-col
// + min-h만 지정)이고, 같은 행 카드끼리 높이를 맞추는 건 부모 그리드의
// items-stretch가 담당한다(Efforts.tsx). 최소 높이만 시안 실측(507px)에 못 미치지
// 않게 min-h-104.75(1676px÷16, 시안값 재해석이 아니라 "이보다 작아지진 않는다"는
// 하한선)로 둔다.
//
// 이전 텍스트 목록(제목 · 진도 · 달성률 한 줄)을 시안대로 인라인 편집 UI로 바꾼다 —
// EffortWorkbookRow가 책 1권당 제목/현재·전체 페이지/진행바/(100%면) 완독 버튼을
// 전부 담당한다. "+ 문제집 추가"는 그대로 목록 아래에 유지한다. 인셋 박스는 고정
// 높이를 두지 않고 내용(책 권수)에 따라 자란다.
//
// 완독 책장: BookStack이 shelved_at이 채워진(=학생이 "완독! 책장에 꽂기"를 누른)
// 책만 그린다. status='done'이어도 아직 안 꽂았으면 공부 중인 책 목록에 완독 버튼과
// 함께 남는다(수동 전이, EffortWorkbookRow 주석 참고). 캡션은 책이 0권일 때만
// "완독하면 여기에 쌓여요" 안내를 보여주고, 1권 이상이면 "N권 완독"으로 바뀐다
// (리뷰 반영 — 시안 캡션은 빈 상태 안내였지 항상 문구가 아니었다).
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
  // 방금 꽂힌 책 id — UI 애니메이션 전용 1회성 상태로 BookStack만 소비한다(Efforts.tsx
  // handleShelveWorkbook이 잠깐 세웠다가 SHELVE_DROP_RESET_MS 뒤 비운다). 이 카드는
  // 그대로 한 단계 전달만 하고 읽지 않는다 — prop drilling이지만 딱 한 단계뿐이라
  // Context 도입은 과함(팀장 지시, 하지 않는다).
  droppingBookId?: string | number | null;
  // 오늘 이 문제집에 연결된 계획 과제(QA 행286-B) — workbook_id → 과제 목록.
  // 연결이 없는 책은 이 맵에 키 자체가 없다(EffortWorkbookRow가 그 경우 소형
  // 목록을 아예 렌더하지 않는다).
  connectedTasksByWorkbookId?: Map<
    number,
    {
      id: string | number;
      title: string;
      status: "pending" | "done" | "fail";
    }[]
  >;
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
  connectedTasksByWorkbookId,
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
    // 카드 셸은 공용 GoalCard primitive(tone neutral)로 감싼다 — 리뷰 지적(§P2
    // 일관성): 전에는 로컬 rounded-xl+border+bg-white를 이 화면만 따로 그렸다.
    <GoalCard
      tone="neutral"
      className="flex h-full min-h-104.75 w-full min-w-0 flex-col border border-surface-01 px-4.75 py-5"
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-[1.25rem] font-semibold leading-[1.4] text-ink">
          {subject}
        </h3>
        <span className="text-[1rem] leading-[1.4] text-ink-natural">
          완독 {completed}권
        </span>
      </div>

      {/* 「공부 중인 책」 인셋 박스 — 목록+추가 버튼을 함께 담는다(위 주석 참고). 카드
          자체가 content-driven이라 여기 max-h는 더 이상 필요 없다(전에는 h-126.75
          고정 카드 안에서 넘치는 걸 막으려 max-h-70으로 다시 스크롤을 걸었는데,
          바깥 카드가 유동이 되면서 이중 스크롤만 남아 제거한다). */}
      <div className="mt-5.5 flex w-full shrink-0 flex-col gap-3 rounded-xl border border-surface-01 bg-goal-card p-5">
        <p className="text-[1rem] font-semibold leading-[1.4] text-ink-natural">
          공부 중인 책
        </p>

        {hasBooks && (
          <div className="flex flex-col gap-3">
            {books.map((book) => {
              const connectedTasks = connectedTasksByWorkbookId?.get(
                Number(book.id),
              );
              return (
                <EffortWorkbookRow
                  key={book.id}
                  book={book}
                  subject={subjectId}
                  {...(connectedTasks ? { connectedTasks } : {})}
                  onUpdate={onUpdateBook ?? (async () => false)}
                  onDelete={onDeleteBook ?? (async () => false)}
                  onShelve={onShelveBook ?? (async () => false)}
                />
              );
            })}
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

      {/* 완독 책장 — 리뷰 반영: 전에는 justify-end + overflow-y-auto를 같이 걸어서
          위로 넘친 책이 스크롤로도 닿지 않는 죽은 영역이었다(카드가 고정 높이일 때
          내용이 넘치면 justify-end가 위쪽을 밀어내는데 스크롤 컨테이너 시작점이
          이미 그 밀린 지점이라 위로는 못 감). 이제 mt-auto로 스택을 카드 하단에
          붙이고, max-h-50(200px, 책 5권 안팎)+overflow-y-auto는 스택 컨테이너에만
          걸어 책이 아무리 늘어도 스크롤로 전부 닿게 한다. */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        {/* 그림자(아래 4px 오프셋+4px 블러)가 스크롤 컨테이너에 잘리지 않도록
            하단·좌우 여백을 둔다 — 여백 없이는 맨 아래 책의 그림자가 통째로 사라진다. */}
        <div className="mt-auto max-h-50 overflow-y-auto px-1 pb-2.5">
          {hasCompletedBooks && (
            <BookStack
              books={completedBooks}
              subject={subjectId}
              droppingId={droppingBookId ?? null}
            />
          )}
        </div>
        {/* 선반 바 폭을 책 바(BookStack, 위 px-1 안쪽 w-full)와 맞춘다 — 전에는
            w-36.75(147px) 고정이라 카드 폭이 늘어나면 선반만 짧게 붕 떠 보였다.
            items-stretch로 이 줄 컨테이너를 카드 폭까지 채우고 mx-1로 책 바와
            같은 좌우 인셋을 준다(책 바는 padding, 선반은 margin — 시각적으로 같은
            경계). */}
        <div className="mt-2 flex shrink-0 flex-col items-stretch gap-2">
          <div className="mx-1 h-1.75 shrink-0 rounded bg-surface-01" />
          <p className="text-center text-[1rem] leading-[1.4] text-ink-natural">
            {hasCompletedBooks
              ? `${completedBooks.length}권 완독`
              : "완독하면 여기에 쌓여요"}
          </p>
        </div>
      </div>
    </GoalCard>
  );
}
