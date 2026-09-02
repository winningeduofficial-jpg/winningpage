import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import EffortSubjectCard from "./EffortSubjectCard";

describe("EffortSubjectCard", () => {
  test("진행 중 문제집을 인셋 박스 안에 제목·진도·달성률 텍스트로 표시하고, + 문제집 추가는 그 아래에 유지된다", () => {
    render(
      <EffortSubjectCard
        subject="국어"
        completed={0}
        books={[
          { id: 1, title: "수능특강 독서", currentPage: 60, totalPages: 240 },
        ]}
      />,
    );

    const row = screen.getByText("수능특강 독서 · 60p/240p · 달성률 25%");
    expect(row).toBeInTheDocument();

    const addButton = screen.getByRole("button", { name: "+ 문제집 추가" });
    expect(addButton).toBeInTheDocument();

    // 인셋 박스(공부 중인 책) 안에 목록과 버튼이 함께 있어야 한다.
    const insetBox = screen.getByText("공부 중인 책").parentElement;
    expect(insetBox).toContainElement(row);
    expect(insetBox).toContainElement(addButton);
  });

  test("완독 0권이면 안내 캡션만 보이고 책 스택은 없다", () => {
    render(<EffortSubjectCard subject="수학" completed={0} books={[]} />);

    expect(screen.getByText("완독하면 여기에 쌓여요")).toBeInTheDocument();
  });

  test("완독 1권 이상이면 안내 캡션 대신 책 스택이 보인다", () => {
    render(
      <EffortSubjectCard
        subject="영어"
        completed={1}
        books={[]}
        completedBooks={[{ id: 9, title: "마더텅 영어듣기" }]}
      />,
    );

    expect(
      screen.queryByText("완독하면 여기에 쌓여요"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("마더텅 영어듣기")).toBeInTheDocument();
  });

  test("목록 행 클릭 시 onEditBook이 해당 책 정보로 호출된다", () => {
    const onEditBook = vi.fn();
    const book = { id: 5, title: "쎈 수학", currentPage: 0, totalPages: 300 };
    render(
      <EffortSubjectCard
        subject="수학"
        completed={0}
        books={[book]}
        onEditBook={onEditBook}
      />,
    );

    screen.getByText("쎈 수학 · 0p/300p · 달성률 0%").click();
    expect(onEditBook).toHaveBeenCalledWith(book);
  });
});
