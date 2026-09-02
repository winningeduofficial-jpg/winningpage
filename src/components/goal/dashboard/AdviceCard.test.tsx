import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import AdviceCard from "./AdviceCard";

// QA 행295·306 — AdviceCard는 GET /api/goal/advice의 sections+majorTips를 그대로
// 그린다. origin(ai/rule) 자체는 이 카드가 아니라 DashboardPageHeader의 뱃지가
// 표시한다(DashboardPageHeader.test.tsx) — 이 파일은 data 유무/shape에 따른 렌더만 본다.
describe("AdviceCard", () => {
  test("data가 null이면(로딩 중/미생성) 제목만 렌더하고 본문·팁은 없다", () => {
    render(<AdviceCard data={null} />);

    expect(screen.getByText("오늘의 조언")).toBeInTheDocument();
    expect(screen.queryByText(/\[.*\]/)).not.toBeInTheDocument();
  });

  test("sections를 라벨 소제목 + 본문으로 렌더한다", () => {
    render(
      <AdviceCard
        data={{
          sections: [
            { label: "[오늘의 조언]", body: "오늘도 잘했어요" },
            { label: "[내일 계획 제시]", body: "내일은 수학부터" },
          ],
          majorTips: [],
        }}
      />,
    );

    expect(screen.getByText("[오늘의 조언]")).toBeInTheDocument();
    expect(screen.getByText("오늘도 잘했어요")).toBeInTheDocument();
    expect(screen.getByText("[내일 계획 제시]")).toBeInTheDocument();
    expect(screen.getByText("내일은 수학부터")).toBeInTheDocument();
  });

  test("majorTips가 있으면 학과명 소제목과 함께 렌더하고, 없으면 렌더하지 않는다", () => {
    const { rerender } = render(
      <AdviceCard
        data={{
          sections: [{ label: "[오늘의 조언]", body: "본문" }],
          majorTips: [
            { department: "서울대 컴퓨터공학과", text: "핵심 과목 안내" },
          ],
        }}
      />,
    );

    expect(screen.getByText("[서울대 컴퓨터공학과]")).toBeInTheDocument();
    expect(screen.getByText("핵심 과목 안내")).toBeInTheDocument();

    rerender(
      <AdviceCard
        data={{
          sections: [{ label: "[오늘의 조언]", body: "본문" }],
          majorTips: [],
        }}
      />,
    );
    expect(screen.queryByText("[서울대 컴퓨터공학과]")).not.toBeInTheDocument();
  });
});
