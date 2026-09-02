import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

  test("blur 없이도 입력이 멈추면 자동 저장된다(디바운스)", async () => {
    vi.useFakeTimers();
    try {
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
        target: { value: "12" },
      });
      fireEvent.change(screen.getByLabelText("현재 페이지"), {
        target: { value: "120" },
      });
      expect(onUpdate).not.toHaveBeenCalled();

      vi.advanceTimersByTime(700);
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith(1, { currentPage: 120 });
    } finally {
      vi.useRealTimers();
    }
  });

  test("blur로 즉시 저장된 뒤 대기 중이던 디바운스 타이머가 나중에 또 저장하지 않는다(이중 저장 경로 제거)", async () => {
    vi.useFakeTimers();
    try {
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

      const currentInput = screen.getByLabelText("현재 페이지");
      fireEvent.change(currentInput, { target: { value: "120" } });
      fireEvent.blur(currentInput);

      expect(onUpdate).toHaveBeenCalledTimes(1);
      // blur가 대기 중이던 타이머를 flush로 흡수했어야 한다 — 원래 예정이던
      // AUTOSAVE_DELAY_MS(600ms)를 더 흘려보내도 두 번째 호출이 없어야 한다.
      await vi.advanceTimersByTimeAsync(700);
      expect(onUpdate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("저장 중 상태 텍스트가 뜨고 저장 완료 후 저장됨으로, 일정 시간 뒤 사라진다", async () => {
    // waitFor/findBy는 실타이머 폴링에 의존해 페이크 타이머와 섞으면 걸리므로,
    // 여기서는 act로 마이크로태스크·타이머를 직접 흘려보낸다(파일 내 기존 디바운스
    // 테스트와 같은 페이크 타이머 패턴).
    vi.useFakeTimers();
    try {
      let resolveUpdate: (ok: boolean) => void = () => {};
      const onUpdate = vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveUpdate = resolve;
          }),
      );
      render(
        <EffortWorkbookRow
          book={BOOK}
          subject="korean"
          onUpdate={onUpdate}
          onDelete={vi.fn()}
          onShelve={vi.fn()}
        />,
      );

      const currentInput = screen.getByLabelText("현재 페이지");
      fireEvent.change(currentInput, { target: { value: "120" } });
      fireEvent.blur(currentInput);

      expect(screen.getByText("저장 중…")).toBeInTheDocument();

      await act(async () => {
        resolveUpdate(true);
        await Promise.resolve();
      });
      expect(screen.getByText("저장됨")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1600);
      });
      expect(screen.queryByText("저장됨")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("저장이 실패하면 저장 실패 문구가 뜨고 입력값이 서버 값으로 되돌아간다", async () => {
    const onUpdate = vi.fn().mockResolvedValue(false);
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
    fireEvent.change(currentInput, { target: { value: "120" } });
    fireEvent.blur(currentInput);

    await screen.findByText("저장 실패 — 다시 시도");
    await waitFor(() => expect(currentInput.value).toBe("60"));
  });

  test("저장이 진행 중일 때 값이 또 바뀌어도 새 요청을 바로 쏘지 않고, 끝난 뒤 최신값으로 한 번만 더 저장한다", async () => {
    const resolvers: Array<(ok: boolean) => void> = [];
    const onUpdate = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    render(
      <EffortWorkbookRow
        book={BOOK}
        subject="korean"
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onShelve={vi.fn()}
      />,
    );

    const currentInput = screen.getByLabelText("현재 페이지");
    fireEvent.change(currentInput, { target: { value: "100" } });
    fireEvent.blur(currentInput);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    // 첫 요청이 아직 안 끝난 상태에서 값을 또 바꾸고 flush한다 — 중복 요청을 바로
    // 쏘지 않아야 한다.
    fireEvent.change(currentInput, { target: { value: "150" } });
    fireEvent.blur(currentInput);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    resolvers[0]?.(true);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
    expect(onUpdate).toHaveBeenNthCalledWith(2, 1, { currentPage: 150 });

    resolvers[1]?.(true);
  });
});
