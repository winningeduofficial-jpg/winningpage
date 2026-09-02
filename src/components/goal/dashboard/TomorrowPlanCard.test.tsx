import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import TomorrowPlanCard from "./TomorrowPlanCard";

// QA 행306 — narrative(GET /api/goal/advice의 "[내일 계획 제시]"/"[다음 계획 제시]" 본문)를
// 기존 규칙 기반 과목·시간 배분 위에 문장으로 덧붙인다.
describe("TomorrowPlanCard", () => {
  test("narrative가 없으면(기본값 null) 문장 없이 칩만 렌더한다", () => {
    render(
      <TomorrowPlanCard plan={[{ subject: "수학", duration: "2시간" }]} />,
    );

    expect(screen.getByText("수학 2시간")).toBeInTheDocument();
  });

  test("narrative가 있으면 칩 위에 문장을 렌더한다", () => {
    render(
      <TomorrowPlanCard
        plan={[{ subject: "수학", duration: "2시간" }]}
        narrative="내일은 수학 오답 정리부터 시작해 보세요."
      />,
    );

    expect(
      screen.getByText("내일은 수학 오답 정리부터 시작해 보세요."),
    ).toBeInTheDocument();
    expect(screen.getByText("수학 2시간")).toBeInTheDocument();
  });

  test("plan이 비어 있으면(목표 시간 미설정) narrative가 있어도 빈 상태 문구를 유지한다", () => {
    render(<TomorrowPlanCard plan={[]} narrative="문장" />);
    expect(
      screen.getByText("내일 계획 산출 준비 중입니다."),
    ).toBeInTheDocument();
  });
});
