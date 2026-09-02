import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PerformanceSidebar from "./PerformanceSidebar";

// QA 행318 — 상단 "메인으로" 링크는 하단 "메인으로 나가기"의 이탈 확인 다이얼로그
// (handleLeaveToMain, window.confirm)를 그대로 재사용해야 한다(중복 구현 금지).
function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={["/app/performance"]}>
      <Routes>
        <Route path="/" element={<div>메인 페이지</div>} />
        <Route path="/app/performance" element={<PerformanceSidebar />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PerformanceSidebar 상단/하단 메인으로 링크", () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, "confirm");
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("상단·하단 모두 '메인으로' 텍스트를 가진 버튼이 있다", () => {
    renderWithRouter();
    const buttons = screen.getAllByRole("button", { name: /메인으로/ });
    expect(buttons).toHaveLength(2);
  });

  it("상단 버튼을 눌러 확인하면 이탈 확인 문구를 띄우고 메인으로 이동한다", async () => {
    confirmSpy.mockReturnValue(true);
    renderWithRouter();

    const topButton = screen.getAllByRole("button", {
      name: "메인으로",
    })[0]!;
    fireEvent.click(topButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      "진행 중인 내용은 자동 저장되지 않을 수 있습니다. 메인으로 이동할까요?",
    );
    // findByText는 못 찾으면 그 자체로 throw한다 — 성공하면 존재가 보장된다.
    await screen.findByText("메인 페이지");
  });

  it("상단 버튼에서 확인을 취소하면 이동하지 않는다", async () => {
    confirmSpy.mockReturnValue(false);
    renderWithRouter();

    const topButton = screen.getAllByRole("button", {
      name: "메인으로",
    })[0]!;
    fireEvent.click(topButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByText("메인 페이지")).toBeNull();
  });
});
