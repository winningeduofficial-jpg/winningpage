import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import GoalGradePyramid from "./GoalGradePyramid";

describe("GoalGradePyramid", () => {
  test("scaleMax=5이면 행 5개를 렌더한다", () => {
    render(<GoalGradePyramid subjectLabel="국어군" grade={2.3} scaleMax={5} />);
    for (let row = 1; row <= 5; row += 1) {
      expect(screen.getByText(`${row}등급`)).toBeInTheDocument();
    }
    expect(screen.queryByText("6등급")).not.toBeInTheDocument();
  });

  test("scaleMax=9이면 행 9개를 렌더한다", () => {
    render(<GoalGradePyramid subjectLabel="국어" grade={3} scaleMax={9} />);
    for (let row = 1; row <= 9; row += 1) {
      expect(screen.getByText(`${row}등급`)).toBeInTheDocument();
    }
  });

  test("활성 행 = round(grade) — 2.3등급은 2등급 행만 강조한다", () => {
    render(<GoalGradePyramid subjectLabel="국어군" grade={2.3} scaleMax={5} />);
    const activeRow = screen.getByText("2등급");
    const inactiveRow = screen.getByText("3등급");
    expect(activeRow.className).toContain("bg-[#E0DDF4]");
    expect(inactiveRow.className).not.toContain("bg-[#E0DDF4]");
  });

  test("비활성 행도 카드 배경과 구분되는 배경·테두리를 가진다(로컬 E2E #2 — 계단식 텍스트만 보이던 버그)", () => {
    render(<GoalGradePyramid subjectLabel="국어군" grade={2.3} scaleMax={5} />);
    const inactiveRow = screen.getByText("5등급");
    expect(inactiveRow.className).toContain("bg-surface-muted");
    expect(inactiveRow.className).toContain("border-border");
    expect(inactiveRow.className).not.toContain("bg-goal-cardTone-neutral");
  });

  test("2.5등급은 반올림 규칙(Math.round)에 따라 3등급 행을 강조한다", () => {
    render(<GoalGradePyramid subjectLabel="국어군" grade={2.5} scaleMax={5} />);
    expect(screen.getByText("3등급").className).toContain("bg-[#E0DDF4]");
    expect(screen.getByText("2등급").className).not.toContain("bg-[#E0DDF4]");
  });

  test("접근성 — role=img + aria-label에 과목명·등급·등급제를 담는다", () => {
    render(<GoalGradePyramid subjectLabel="국어군" grade={2.3} scaleMax={5} />);
    expect(
      screen.getByRole("img", { name: "국어군 2.3등급, 5등급제" }),
    ).toBeInTheDocument();
  });

  test("등급 없음(null)이면 미입력으로 표시하고 마커를 그리지 않는다", () => {
    render(<GoalGradePyramid subjectLabel="탐구1" grade={null} scaleMax={9} />);
    expect(
      screen.getByRole("img", { name: "탐구1 미입력, 9등급제" }),
    ).toBeInTheDocument();
    for (let row = 1; row <= 9; row += 1) {
      expect(screen.getByText(`${row}등급`).className).not.toContain(
        "bg-[#E0DDF4]",
      );
    }
  });

  test("1등급 행이 가장 좁고 등급이 커질수록 넓어진다(역피라미드)", () => {
    render(<GoalGradePyramid subjectLabel="국어군" grade={3} scaleMax={5} />);
    const row1 = screen.getByText("1등급");
    const row5 = screen.getByText("5등급");
    const width1 = Number.parseFloat(row1.style.width);
    const width5 = Number.parseFloat(row5.style.width);
    expect(width1).toBeLessThan(width5);
    expect(width1).toBeCloseTo(48, 5); // 36 + 1*(60/5)
    expect(width5).toBeCloseTo(96, 5); // 36 + 5*(60/5)
  });
});
