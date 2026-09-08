import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import ChildCard, { type Child } from "./ChildCard";

// 서비스 행마다 리포트 링크가 붙는지 검증한다(QA 시트 행210, 시안 3754-6765).
// target/diagnose 는 REPORT_PATH_BY_PROGRAM 매핑이 있어 링크가 생기고,
// suhaeng 는 매핑이 없어 이름·상태만 렌더된다. 하단은 안내 문구로 바뀌었다.

function renderCard(child: Child) {
  return render(
    <MemoryRouter>
      <ChildCard child={child} />
    </MemoryRouter>,
  );
}

const APPROVED_CHILD: Child = {
  link_id: "link-1",
  link_status: "approved",
  student_name: "김철수",
  school_name: "위닝고등학교",
  school_type: "고등학교",
  linked_at: "2026-03-01T00:00:00Z",
  student_profile_id: "student-1",
  services: [
    {
      program_key: "target",
      program_name: "위닝 목표관리",
      unlimited_period: true,
    },
    {
      program_key: "suhaeng",
      program_name: "위닝 수행평가",
      remaining: 2,
    },
    {
      program_key: "diagnose",
      program_name: "위닝 학습진단",
      remaining: 0,
    },
  ],
};

const PENDING_CHILD: Child = {
  link_id: "link-2",
  link_status: "pending",
  student_name: "이영희",
  linked_at: "2026-03-02T00:00:00Z",
  student_profile_id: "student-2",
};

describe("ChildCard", () => {
  it("approved 상태에서 target/diagnose 만 리포트 링크를 갖고 suhaeng 은 링크가 없다", () => {
    renderCard(APPROVED_CHILD);

    const links = screen.getAllByRole("link", { name: "리포트 보기 →" });
    expect(links).toHaveLength(2);
    expect(links.map((a) => a.getAttribute("href")).sort()).toEqual(
      [
        "/mypage/children/student-1/report",
        "/mypage/children/student-1/report/diagnosis",
      ].sort(),
    );

    expect(screen.getByText("위닝 수행평가")).toBeInTheDocument();

    expect(
      screen.getByText("이용 중인 서비스의 리포트만 열람할 수 있어요"),
    ).toBeInTheDocument();
  });

  it("pending 상태는 링크와 안내 문구가 없다", () => {
    renderCard(PENDING_CHILD);

    expect(
      screen.queryByRole("link", { name: "리포트 보기 →" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("이용 중인 서비스의 리포트만 열람할 수 있어요"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("자녀가 연결 요청을 수락하면 이용 내역이 표시돼요"),
    ).toBeInTheDocument();
  });
});
