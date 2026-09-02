import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import EffortSubjectCard from "./EffortSubjectCard";

// 인라인 편집 자체(제목/페이지 blur 저장, 삭제 2단계 확인, 완독 버튼)는
// EffortWorkbookRow.test.tsx가 담당한다 — 여기서는 카드 레이아웃과 배선만 검증한다.
describe("EffortSubjectCard", () => {
  test("진행 중 문제집은 인셋 박스 안에 인라인 편집 행으로 렌더되고, + 문제집 추가는 그 아래에 있다", () => {
    render(
      <EffortSubjectCard
        subject="국어"
        completed={0}
        books={[
          { id: 1, title: "수능특강 독서", currentPage: 60, totalPages: 240 },
        ]}
      />,
    );

    const titleInput = screen.getByDisplayValue("수능특강 독서");
    const addButton = screen.getByRole("button", { name: "+ 문제집 추가" });

    // 인셋 박스(공부 중인 책) 안에 편집 행과 추가 버튼이 함께 있어야 한다.
    const insetBox = screen.getByText("공부 중인 책").parentElement;
    expect(insetBox).toContainElement(titleInput);
    expect(insetBox).toContainElement(addButton);
  });

  test("완독 0권이면 안내 캡션만 보이고 책 스택은 없다", () => {
    render(<EffortSubjectCard subject="수학" completed={0} books={[]} />);

    expect(screen.getByText("완독하면 여기에 쌓여요")).toBeInTheDocument();
  });

  test("완독 1권 이상이어도 캡션은 시안대로 항상 표시되고 책 스택도 함께 보인다", () => {
    render(
      <EffortSubjectCard
        subject="영어"
        completed={1}
        books={[]}
        completedBooks={[
          {
            id: 9,
            title: "마더텅 영어듣기",
            shelvedAt: "2026-09-01T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("완독하면 여기에 쌓여요")).toBeInTheDocument();
    expect(screen.getByText("마더텅 영어듣기")).toBeInTheDocument();
  });

  test("+ 문제집 추가 클릭 시 onAddBook이 호출된다", () => {
    const onAddBook = vi.fn();
    render(
      <EffortSubjectCard
        subject="수학"
        completed={0}
        books={[]}
        onAddBook={onAddBook}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ 문제집 추가" }));
    expect(onAddBook).toHaveBeenCalled();
  });

  test("책 목록 행의 제목 입력을 바꾸고 blur하면 onUpdateBook이 호출된다(배선 확인)", () => {
    const onUpdateBook = vi.fn().mockResolvedValue(true);
    const book = { id: 5, title: "쎈 수학", currentPage: 0, totalPages: 300 };
    render(
      <EffortSubjectCard
        subject="수학"
        completed={0}
        books={[book]}
        onUpdateBook={onUpdateBook}
      />,
    );

    const titleInput = screen.getByDisplayValue("쎈 수학");
    fireEvent.change(titleInput, { target: { value: "쎈 수학 하" } });
    fireEvent.blur(titleInput);

    expect(onUpdateBook).toHaveBeenCalledWith(5, { title: "쎈 수학 하" });
  });
});
