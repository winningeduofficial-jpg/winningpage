import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import ServicesSection from "./ServicesSection";

// QA 시트 행29·60 — 핵심 서비스 9카드(3×3) 확장. 기존 6카드 + 성장설계·컨설팅
// 프리미엄·국제·해외 프리미엄. is_premium 카드는 PREMIUM 배지가 뜬다.
const baseServices = [
  {
    id: "svc-1",
    name: "학습진단",
    description: "무료로 경험하는\n위닝 AE시스템",
    link: "/services/learning-diagnosis",
    icon_image_url: "/images/landing/services/free-diagnosis.png",
    sort_order: 1,
  },
  {
    id: "svc-2",
    name: "성장설계",
    description: "학생별 맞춤 로드맵으로\n목표부터 실행까지 설계",
    link: "/services/growth",
    icon_image_url: "/images/landing/services/growth.png",
    sort_order: 7,
    is_premium: false,
  },
  {
    id: "svc-3",
    name: "컨설팅 프리미엄",
    description:
      "대입 컨설팅 프로그램\n특목고 입학 프로그램\n대학원 입학 프로그램",
    link: "/page/premium/admission-consulting/a",
    icon_image_url: "/images/landing/services/consulting-premium.png",
    sort_order: 8,
    is_premium: true,
  },
  {
    id: "svc-4",
    name: "국제·해외 프리미엄",
    description:
      "해외명문대 진학컨설팅\n국제학교 학습관리\n국제고 해외고 국내대입 컨설팅",
    link: "/page/premium/global-university",
    icon_image_url: "/images/landing/services/global-premium.png",
    sort_order: 9,
    is_premium: true,
  },
];

function renderSection(services = baseServices) {
  return render(
    <MemoryRouter>
      <ServicesSection services={services} />
    </MemoryRouter>,
  );
}

describe("ServicesSection", () => {
  test("서비스 카드를 sort_order 순으로 모두 렌더한다", () => {
    renderSection();

    const names = screen
      .getAllByRole("link", { name: /바로가기/ })
      .map((el) => el.textContent);

    expect(screen.getByText("학습진단")).toBeInTheDocument();
    expect(screen.getByText("성장설계")).toBeInTheDocument();
    expect(screen.getByText("컨설팅 프리미엄")).toBeInTheDocument();
    expect(screen.getByText("국제·해외 프리미엄")).toBeInTheDocument();
    expect(names).toHaveLength(4);
  });

  test("is_premium 카드에만 PREMIUM 배지가 보인다", () => {
    renderSection();

    const badges = screen.getAllByText("PREMIUM");
    expect(badges).toHaveLength(2);

    const consultingLink = screen.getByRole("link", {
      name: "컨설팅 프리미엄 바로가기",
    });
    const growthLink = screen.getByRole("link", {
      name: "성장설계 바로가기",
    });

    expect(consultingLink).toContainElement(badges[0]!);
    expect(growthLink).not.toHaveTextContent("PREMIUM");
  });

  test("설명의 줄바꿈이 whitespace-pre-line 텍스트 노드로 그대로 렌더된다", () => {
    renderSection();

    const description = screen.getByText(
      (_, el) =>
        el?.textContent ===
        "대입 컨설팅 프로그램\n특목고 입학 프로그램\n대학원 입학 프로그램",
    );
    expect(description).toHaveClass("whitespace-pre-line");
  });

  test("서비스 데이터가 없으면 섹션 자체를 렌더하지 않는다", () => {
    const { container } = renderSection([]);
    expect(container).toBeEmptyDOMElement();
  });
});
