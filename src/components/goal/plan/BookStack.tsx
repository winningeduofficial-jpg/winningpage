import { getSubjectStrongClass } from "@/components/goal/subjectTokens";

// 완독 문제집 책장 시각화 — EffortSubjectCard 하단 선반 위에서 쓴다(QA 행282/298).
// 이미지 에셋은 없다 — 책등을 가로 막대(누운 책)로 그리고, 오래 완독한 책일수록
// 선반(아래)에 가깝고 최근 완독한 책이 위로 쌓이도록 flex-col-reverse로 뒤집는다
// (fetchWorkbooks가 등록 순=오래된 순으로 돌려주므로, books 배열은 그대로 오래된
// 순이다 — api/_lib/goalRepo.ts fetchWorkbooks 주석 참고).
//
// 막대 하나가 책 한 권: 너비는 제목 길이 기반(길수록 넓게, 카드 폭 안에서 클램프),
// 높이는 0.75~1rem(h-3~h-4) 사이를 인덱스로 순환시켜 실제 책장처럼 두께가 들쭉날쭉해
// 보이게 한다. 색은 과목 진한 톤(getSubjectStrongClass)을 그대로 쓴다.

type StackBook = { id: string | number; title: string };

type BookStackProps = {
  books: StackBook[];
  subject: string;
};

// 카드 높이가 고정(451px)이라 무한정 쌓을 수 없다 — 이 이상은 "+n권" 뱃지로 접는다.
const MAX_VISIBLE_BOOKS = 6;

// 0.75rem(h-3) → 0.875rem(h-3.5) → 1rem(h-4) 순환.
const HEIGHT_CLASSES = ["h-3", "h-3.5", "h-4"];

// 제목 글자 수를 인셋 박스 폭(약 17rem) 안에 들어오는 너비 비율(%)로 대략 환산한다.
// 정확한 텍스트 측정이 아니라 "길수록 넓어 보이는" 시각적 근사치다.
function widthPercentFor(title: string) {
  const length = title.trim().length || 1;
  return Math.min(100, Math.max(42, 40 + length * 4));
}

export default function BookStack({ books, subject }: BookStackProps) {
  if (books.length === 0) return null;

  const visible = books.slice(-MAX_VISIBLE_BOOKS);
  const hiddenCount = books.length - visible.length;
  const strongClass = getSubjectStrongClass(subject);

  return (
    <div className="flex w-full flex-col-reverse items-center gap-1">
      {visible.map((book, index) => (
        <div
          key={book.id}
          style={{ width: `${widthPercentFor(book.title)}%` }}
          className={`flex shrink-0 items-center justify-center rounded-sm px-2 shadow-[0_1px_1px_rgba(0,0,0,0.12)] ${HEIGHT_CLASSES[index % HEIGHT_CLASSES.length]} ${strongClass}`}
        >
          <span className="truncate text-[0.5625rem] font-medium leading-none text-white">
            {book.title}
          </span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <span className="text-[0.6875rem] font-semibold leading-[1.4] text-ink-sub">
          +{hiddenCount}권
        </span>
      )}
    </div>
  );
}
