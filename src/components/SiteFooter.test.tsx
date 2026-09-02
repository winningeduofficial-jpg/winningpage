import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import SiteFooter from "./SiteFooter";

// 푸터 회귀 테스트(dev 레이아웃 기준). useNavGroups는 실제 구현을 쓰지 않고 5개 그룹
// 고정값으로 대체한다(Header.test.tsx의 관례를 따름) — 실 Supabase 조회가 테스트에
// 영향을 주지 않게 하기 위함이다.
vi.mock("@/hooks/useNavGroups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useNavGroups")>();
  return {
    ...actual,
    useNavGroups: () => [
      {
        title: "서비스",
        to: "/services",
        items: [{ label: "학습진단", to: "/diagnosis", sortOrder: 0 }],
      },
      {
        title: "프리미엄",
        to: "/premium",
        items: [{ label: "프리미엄 안내", to: "/premium", sortOrder: 0 }],
      },
      {
        title: "입시정보",
        to: "/info",
        items: [{ label: "대학모집요강", to: "/info/admission", sortOrder: 0 }],
      },
      {
        title: "이용신청",
        to: "/apply",
        items: [{ label: "상담신청", to: "/apply/consult", sortOrder: 0 }],
      },
      {
        title: "고객안내",
        to: "/support",
        items: [{ label: "자주묻는질문", to: "/support/faq", sortOrder: 0 }],
      },
    ],
  };
});

function renderFooter() {
  return render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  );
}

describe("SiteFooter", () => {
  it("5개 컬럼 제목을 모두 렌더한다", () => {
    renderFooter();
    for (const title of [
      "서비스",
      "프리미엄",
      "입시정보",
      "이용신청",
      "고객안내",
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it("정본 로고(winning-logo-stacked.svg)를 alt와 함께 렌더한다", () => {
    renderFooter();
    const logos = screen.getAllByAltText("위닝에듀");
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of logos) {
      expect(logo).toHaveAttribute("src", "/images/winning-logo-stacked.svg");
    }
  });

  it("이용약관·개인정보처리방침 링크의 href가 올바르다", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(
      screen.getByRole("link", { name: "개인정보처리방침" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("사업자 정보 텍스트를 포함한다", () => {
    renderFooter();
    expect(screen.getByText(/상호명: 주식회사 위닝에듀/)).toBeInTheDocument();
  });
});
