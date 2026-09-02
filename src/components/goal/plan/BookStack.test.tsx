import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import BookStack from "./BookStack";

describe("BookStack", () => {
  test("책이 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<BookStack books={[]} subject="korean" />);
    expect(container.firstChild).toBeNull();
  });

  test("책 제목을 전부 렌더한다(6권 이하)", () => {
    render(
      <BookStack
        books={[
          { id: 1, title: "수능특강 독서" },
          { id: 2, title: "자이스토리" },
        ]}
        subject="math"
      />,
    );
    expect(screen.getByText("수능특강 독서")).toBeInTheDocument();
    expect(screen.getByText("자이스토리")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+권$/)).not.toBeInTheDocument();
  });

  test("6권을 넘으면 최근 6권만 그리고 나머지는 +n권 뱃지로 접는다", () => {
    const books = Array.from({ length: 9 }, (_, i) => ({
      id: i,
      title: `문제집${i}`,
    }));
    render(<BookStack books={books} subject="english" />);

    // 오래된 순 배열이므로 앞의 3권(0,1,2)은 숨고 뒤의 6권(3~8)만 보인다.
    expect(screen.queryByText("문제집0")).not.toBeInTheDocument();
    expect(screen.queryByText("문제집2")).not.toBeInTheDocument();
    expect(screen.getByText("문제집3")).toBeInTheDocument();
    expect(screen.getByText("문제집8")).toBeInTheDocument();
    expect(screen.getByText("+3권")).toBeInTheDocument();
  });
});
