import {
  getBookDarkBgClass,
  getBookDarkTextClass,
  getBookLightBgClass,
} from "@/components/goal/subjectTokens";
import { sortShelvedBooksNewestFirst } from "@/lib/goal/workbookProgress";

// 완독 문제집 책장 시각화 — Figma 4026:6046. EffortSubjectCard 하단 선반 위에서 쓴다.
//
// 책 1권 = w-full h-8(2rem) 바, 카드 인셋 박스와 같은 폭(부모가 px-1로 좌우
// 인셋을 준다), radius rounded-md(0.375rem), bg 과목 라이트, 좌측 w-2(0.5rem)
// 책등(과목 다크, 좌측만 radius). 제목은 책등 다음 pl-3.5(0.875rem)부터, 과목
// 다크 톤 text-[1rem] font-medium. 세로 gap-2(0.5rem, 바 2rem + gap 0.5rem = pitch
// 2.5rem).
//
// 정렬: 최신 완독이 위(sortShelvedBooksNewestFirst, src/lib/goal/workbookProgress.ts).
// 컨테이너는 flex-col 그대로 두고 정렬된 배열의 첫 항목(최신)을 맨 위에 그린다 —
// 그 아래로 갈수록 오래된 책이고, 이 컨테이너 바로 아래에 선반(EffortSubjectCard)이
// 있으므로 배열 마지막(가장 오래된 책)이 선반과 가장 가깝다.

type StackBook = {
  id: string | number;
  title: string;
  shelvedAt: string | null;
};

type BookStackProps = {
  books: StackBook[];
  subject: string;
  /** 방금 "완독! 책장에 꽂기"로 들어온 책 id — 드롭 애니메이션(.book-drop)을 1회 건다. */
  droppingId?: string | number | null;
};

export default function BookStack({
  books,
  subject,
  droppingId,
}: BookStackProps) {
  if (books.length === 0) return null;

  const sorted = sortShelvedBooksNewestFirst(books);
  const lightBg = getBookLightBgClass(subject);
  const darkBg = getBookDarkBgClass(subject);
  const darkText = getBookDarkTextClass(subject);

  return (
    <div className="flex w-full flex-col gap-2">
      {sorted.map((book) => (
        <div
          key={book.id}
          className={`flex h-8 w-full shrink-0 items-center overflow-hidden rounded-md shadow-[0_4px_4px_rgba(0,0,0,0.25)] ${lightBg}${
            droppingId != null && String(droppingId) === String(book.id)
              ? " book-drop"
              : ""
          }`}
        >
          <div className={`h-full w-2 shrink-0 rounded-l-md ${darkBg}`} />
          <span
            className={`truncate pr-3 pl-3.5 text-[1rem] font-medium leading-none ${darkText}`}
          >
            {book.title}
          </span>
        </div>
      ))}
    </div>
  );
}
