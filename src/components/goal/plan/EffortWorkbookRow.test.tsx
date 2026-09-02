import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import EffortWorkbookRow from "./EffortWorkbookRow";

const BOOK = {
  id: 1,
  title: "수능특강 독서",
  currentPage: 60,
  totalPages: 240,
};

describe("EffortWorkbookRow", () => {
  test("제목을 바꾸고 blur하면 onUpdate가 새 제목으로 호출된다", () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(
      <EffortWorkbookRow
        book={BOOK}
        subject="korean"
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onShelve={vi.fn()}
      />,
    );

    const titleInput = screen.getByLabelText("문제집 이름");
    fireEvent.change(titleInput, { target: { value: "자이스토리" } });
    fireEvent.blur(titleInput);

    expect(onUpdate).toHaveBeenCalledWith(1, { title: "자이스토리" });
  });

  test("제목을 바꾸지 않고 blur하면 onUpdate를 호출하지 않는다", () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(
      <EffortWorkbookRow
        book={BOOK}
        subject="korean"
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onShelve={vi.fn()}
      />,
    );

    fireEvent.blur(screen.getByLabelText("문제집 이름"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("현재 페이지를 바꾸고 blur하면 onUpdate가 currentPage만 담아 호출된다", () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(
      <EffortWorkbookRow
        book={BOOK}
        subject="korean"
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onShelve={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("현재 페이지"), {
      target: { value: "120" },
    });
    fireEvent.blur(screen.getByLabelText("현재 페이지"));

    expect(onUpdate).toHaveBeenCalledWith(1, { currentPage: 120 });
  });

  test("현재 페이지에 전체 페이지를 넘는 값을 넣으면 전체 페이지로 잘린다", () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(
      <EffortWorkbookRow
        book={BOOK}
        subject="korean"
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onShelve={vi.fn()}
      />,
    );

    const currentInput = screen.getByLabelText<HTMLInputElement>("현재 페이지");
    fireEvent.change(currentInput, { target: { value: "999" } });
    expect(currentInput.value).toBe("240");
    fireEvent.blur(currentInput);

    expect(onUpdate).toHaveBeenCalledWith(1, { currentPage: 240 });
  });

  test("전체 페이지는 입력이 아니라 읽기 전용 표시다", () => {
    render(
      <EffortWorkbookRow
        book={BOOK}
        subject="korean"
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onShelve={vi.fn()}
      />,
    );

    const total = screen.getByLabelText("전체 페이지");
    expect(total.tagName).not.toBe("INPUT");
    expect(total.textContent).toBe("240");
  });

  test("달성률이 100% 미만이면 완독 버튼이 없다", () => {
    render(
      <EffortWorkbookRow
        book={BOOK}
        subject="korean"
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onShelve={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "완독! 책장에 꽂기" }),
    ).not.toBeInTheDocument();
  });

  test("달성률이 100%면 완독 버튼이 보이고 클릭 시 onShelve가 호출된다", () => {
    const onShelve = vi.fn().mockResolvedValue(true);
    render(
      <EffortWorkbookRow
        book={{ ...BOOK, currentPage: 240, totalPages: 240 }}
        subject="korean"
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onShelve={onShelve}
      />,
    );

    const shelveButton = screen.getByRole("button", {
      name: "완독! 책장에 꽂기",
    });
    fireEvent.click(shelveButton);
    expect(onShelve).toHaveBeenCalledWith(1);
  });

  test("삭제는 1클릭으로 실행되지 않고 확인 UI로 전환된 뒤 2클릭째 onDelete가 호출된다", () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <EffortWorkbookRow
        book={BOOK}
        subject="korean"
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onShelve={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("문제집 삭제"));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  test("blur 전이라도 입력값이 전체 페이지에 닿으면 완독 버튼이 뜨고, 꽂기 시 페이지를 먼저 저장한다", async () => {
    const calls: string[] = [];
    const onUpdate = vi.fn(async () => {
      calls.push("update");
      return true;
    });
    const onShelve = vi.fn(async () => {
      calls.push("shelve");
      return true;
    });
    render(
      <EffortWorkbookRow
        book={{ ...BOOK, currentPage: 239, totalPages: 240 }}
        subject="korean"
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onShelve={onShelve}
      />,
    );

    expect(screen.queryByText("완독! 책장에 꽂기")).toBeNull();
    fireEvent.change(screen.getByLabelText("현재 페이지"), {
      target: { value: "240" },
    });
    fireEvent.click(screen.getByText("완독! 책장에 꽂기"));
    await waitFor(() => expect(onShelve).toHaveBeenCalledWith(1));

    expect(onUpdate).toHaveBeenCalledWith(1, { currentPage: 240 });
    expect(calls).toEqual(["update", "shelve"]);
  });
});
