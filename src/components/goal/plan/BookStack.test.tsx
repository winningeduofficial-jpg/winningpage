import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import BookStack from "./BookStack";

describe("BookStack", () => {
  test("책이 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<BookStack books={[]} subject="korean" />);
    expect(container.firstChild).toBeNull();
  });

  test("책 제목을 전부 렌더한다(스택은 개수 상한 없이 전부 그린다, 스크롤은 부모가 담당)", () => {
    render(
      <BookStack
        books={[
          {
            id: 1,
            title: "수능특강 독서",
            shelvedAt: "2026-08-01T00:00:00.000Z",
          },
          { id: 2, title: "자이스토리", shelvedAt: "2026-09-01T00:00:00.000Z" },
        ]}
        subject="math"
      />,
    );
    expect(screen.getByText("수능특강 독서")).toBeInTheDocument();
    expect(screen.getByText("자이스토리")).toBeInTheDocument();
  });

  test("최신 완독(shelvedAt이 늦은 책)이 DOM 맨 앞(스택 맨 위)에 온다", () => {
    render(
      <BookStack
        books={[
          { id: 1, title: "오래된 책", shelvedAt: "2026-08-01T00:00:00.000Z" },
          { id: 2, title: "최근 책", shelvedAt: "2026-09-01T00:00:00.000Z" },
        ]}
        subject="english"
      />,
    );

    const titles = screen.getAllByText(/책$/).map((el) => el.textContent);
    expect(titles).toEqual(["최근 책", "오래된 책"]);
  });
});
