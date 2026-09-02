import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoalOnboardingProvider } from "@/context/GoalOnboardingContext";
import Step5MockExam from "./Step5MockExam";

// 로컬 E2E 후속 — 백분위 칩에 선택 상태가 시각적으로만 있고 접근성 트리(aria-pressed)에는
// 없던 문제 + 등급만 입력하고 칩을 안 누르면 아무 칩도 선택 상태로 안 보이던 문제(팀장
// 지시) 회귀 테스트. Step7DailySchedule.test.tsx와 같은 패턴(컨텍스트 Provider로 감싸
// "UI 조작 → 상태/렌더 변화"만 검증).

function renderStep5() {
  const goPrev = vi.fn();
  const goNext = vi.fn();
  render(
    <GoalOnboardingProvider>
      <Step5MockExam goPrev={goPrev} goNext={goNext} />
    </GoalOnboardingProvider>,
  );
  return { goPrev, goNext };
}

describe("Step5MockExam 백분위 칩", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("등급을 입력하면 '안정' 칩이 기본 선택 상태(aria-pressed=true)로 표시된다", () => {
    renderStep5();

    // grade 기본값이 없으면(null) safeGrade가 '고1'로 방어되어 고1 회차만 노출된다.
    fireEvent.click(screen.getByRole("button", { name: "고1 3모" }));

    // MOCK_SUBJECTS(kor/math/tam1/tam2) 중 첫 번째(국어) 등급 입력 — placeholder가
    // "1~9"로 5과목(영어 포함) 전부 같아 배열의 첫 원소로 국어를 특정한다.
    const [korInput] = screen.getAllByPlaceholderText("1~9");
    fireEvent.change(korInput!, { target: { value: "3" } });

    // GRADE_PERCENTILE[3] = {min:77, max:88} → "안정" = round((77+88)/2) = round(82.5) = 83.
    const stableChip = screen.getByRole("button", { name: "83(안정)" });
    expect(stableChip).toHaveAttribute("aria-pressed", "true");

    // 다른 칩(컷=77)은 선택되지 않은 상태여야 한다.
    const cutChip = screen.getByRole("button", { name: "77(컷)" });
    expect(cutChip).toHaveAttribute("aria-pressed", "false");
  });

  it("칩을 직접 누르면 그 칩만 선택 상태(aria-pressed=true)로 바뀐다", () => {
    renderStep5();
    fireEvent.click(screen.getByRole("button", { name: "고1 3모" }));

    const [korInput] = screen.getAllByPlaceholderText("1~9");
    fireEvent.change(korInput!, { target: { value: "3" } });

    const maxChip = screen.getByRole("button", { name: "88(최고)" });
    fireEvent.click(maxChip);

    expect(maxChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "83(안정)" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
