import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import ServicesSection from "./ServicesSection";
import type { Service } from "./services/ServiceCard";

// QA 시트 행29·60 — 핵심 서비스 9카드(3×3) 확장. 기존 6카드 + 성장설계·컨설팅
// 프리미엄·국제·해외 프리미엄. PREMIUM 배지는 2026-09-03부터 일러스트 PNG에 이미
// 합성돼 있으므로 DOM에는 별도로 렌더되지 않는다(is_premium 은 타입에만 남는다).
const baseServices: Service[] = [
  {
    id: "svc-1",
    name: "학습진단",
    description: "무료로 경험하는\n위닝 AE시스템",
    link: "/services/learning-diagnosis",
    icon_image_url: "/images/landing/services/learning-diagnosis.png",
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

function renderSection(services: Service[] = baseServices) {
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

  // 카드 폭 ≥21rem(컨테이너 쿼리)에서만 whitespace-pre로 전환된다(사용자 확정 최종
  // 사이징 규칙) — jsdom은 컨테이너 쿼리를 평가하지 않으므로 기본(whitespace-pre-line)
  // 클래스와 전환용 @[21rem]: 클래스가 둘 다 붙어 있는지만 확인한다.
  test("설명의 줄바꿈이 whitespace-pre-line 기본 + @[21rem]:whitespace-pre 전환 클래스로 렌더된다", () => {
    renderSection();

    const description = screen.getByText(
      (_, el) =>
        el?.textContent ===
        "대입 컨설팅 프로그램\n특목고 입학 프로그램\n대학원 입학 프로그램",
    );
    expect(description).toHaveClass(
      "whitespace-pre-line",
      "@[21rem]:whitespace-pre",
    );
  });

  test("일러스트 이미지는 icon_image_url 을 그대로 src 로 사용한다(배지·그림자는 이미지에 합성됨)", () => {
    renderSection();

    const img = screen
      .getByRole("link", {
        name: "컨설팅 프리미엄 바로가기",
      })
      .querySelector("img");
    expect(img).toHaveAttribute(
      "src",
      "/images/landing/services/consulting-premium.png",
    );
  });

  test("서비스 데이터가 없으면 섹션 자체를 렌더하지 않는다", () => {
    const { container } = renderSection([]);
    expect(container).toBeEmptyDOMElement();
  });
});
