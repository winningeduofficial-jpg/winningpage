import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import AddWorkbookModal from "./AddWorkbookModal";

// "취소"는 모달 하단 공용 취소 버튼과 삭제 인라인 확인의 취소 버튼 둘 다에 쓰여
// getByRole만으로는 모호하다 — 삭제 확인 문구가 속한 컨테이너로 범위를 좁힌다.
function getDeleteConfirmRegion() {
  return screen.getByText("정말 삭제할까요?").closest("div");
}

const EDITING_WORKBOOK = {
  id: 42,
  subject: "korean",
  title: "수능특강 독서",
  totalPages: 240,
  currentPage: 60,
};

describe("AddWorkbookModal 삭제(인라인 2단계 확인)", () => {
  test("onDelete가 없으면 삭제 버튼을 그리지 않는다", () => {
    render(
      <AddWorkbookModal
        open
        onClose={vi.fn()}
        editingWorkbook={EDITING_WORKBOOK}
        onSubmit={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(screen.queryByText("문제집 삭제")).not.toBeInTheDocument();
  });

  test("신규 등록 모드(수정 아님)에서는 삭제 버튼이 없다", () => {
    render(
      <AddWorkbookModal
        open
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(screen.queryByText("문제집 삭제")).not.toBeInTheDocument();
  });

  test("1클릭으로는 삭제되지 않고 확인 UI로 전환만 된다", () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <AddWorkbookModal
        open
        onClose={vi.fn()}
        editingWorkbook={EDITING_WORKBOOK}
        onSubmit={vi.fn().mockResolvedValue(true)}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("문제집 삭제"));

    expect(onDelete).not.toHaveBeenCalled();
    const region = within(getDeleteConfirmRegion()!);
    expect(screen.getByText("정말 삭제할까요?")).toBeInTheDocument();
    expect(region.getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(region.getByRole("button", { name: "취소" })).toBeInTheDocument();
  });

  test("2단계에서 '삭제'를 누르면 onDelete가 workbook id로 호출되고 모달이 닫힌다", async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <AddWorkbookModal
        open
        onClose={onClose}
        editingWorkbook={EDITING_WORKBOOK}
        onSubmit={vi.fn().mockResolvedValue(true)}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("문제집 삭제"));
    fireEvent.click(
      within(getDeleteConfirmRegion()!).getByRole("button", {
        name: "삭제",
      }),
    );

    await vi.waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(42);
      expect(onClose).toHaveBeenCalled();
    });
  });

  test("2단계에서 '취소'를 누르면 삭제 없이 1단계 버튼으로 되돌아간다", () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <AddWorkbookModal
        open
        onClose={vi.fn()}
        editingWorkbook={EDITING_WORKBOOK}
        onSubmit={vi.fn().mockResolvedValue(true)}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("문제집 삭제"));
    fireEvent.click(
      within(getDeleteConfirmRegion()!).getByRole("button", {
        name: "취소",
      }),
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("문제집 삭제")).toBeInTheDocument();
  });
});
