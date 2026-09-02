import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import AddWorkbookModal from "./AddWorkbookModal";

// 편집/삭제 UI는 EffortWorkbookRow.test.tsx로 이동했다 — 이 모달은 이제 신규 등록
// 전용이다(팀장 지시, Figma 4026:6046 재구현).
describe("AddWorkbookModal — 신규 등록 전용", () => {
  test("프리셀렉트 과목이 있으면 그 과목 칩이 선택된 채로 열린다", () => {
    render(
      <AddWorkbookModal
        open
        onClose={vi.fn()}
        initialSubject="국어"
        onSubmit={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(screen.getByRole("radio", { name: "국어" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("과목과 이름을 입력하고 제출하면 onSubmit이 id 없이 호출된다", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <AddWorkbookModal
        open
        onClose={onClose}
        initialSubject="국어"
        onSubmit={onSubmit}
      />,
    );

    // ModalField required 필드는 라벨에 "*"가 붙어 접근성 이름이 "문제집 이름*"가
    // 된다 — exact:false로 부분 일치시킨다.
    fireEvent.change(screen.getByLabelText("문제집 이름", { exact: false }), {
      target: { value: "수능특강 독서" },
    });
    fireEvent.click(screen.getByRole("button", { name: "문제집 추가하기" }));

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        subject: "korean",
        title: "수능특강 독서",
        currentPage: 0,
        totalPage: 240,
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  test("문제집 이름이 비어 있으면 제출 버튼이 비활성화된다", () => {
    render(
      <AddWorkbookModal
        open
        onClose={vi.fn()}
        initialSubject="국어"
        onSubmit={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(
      screen.getByRole("button", { name: "문제집 추가하기" }),
    ).toBeDisabled();
  });
});
