import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import ServiceCard, { type Service } from "./ServiceCard";

function renderCard(service: Service) {
  return render(
    <MemoryRouter>
      <ServiceCard service={service} />
    </MemoryRouter>,
  );
}

describe("ServiceCard", () => {
  test("link 가 내부 경로면 Link 로 렌더한다", () => {
    renderCard({
      id: "svc-1",
      name: "학습진단",
      link: "/services/learning-diagnosis",
      icon_image_url: "/images/landing/services/learning-diagnosis.png",
    });

    const link = screen.getByRole("link", { name: "학습진단 바로가기" });
    expect(link).toHaveAttribute("href", "/services/learning-diagnosis");
  });

  test("link 가 외부 URL이면 새 탭 a 태그로 렌더한다", () => {
    renderCard({
      id: "svc-5",
      name: "외부 서비스",
      link: "https://example.com/service",
    });

    const link = screen.getByRole("link", { name: "외부 서비스 바로가기" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  // 어드민이 link 를 아직 안 채운 신규 서비스 — 클릭 영역 없이 카드만 보여준다(현행 유지).
  test("link 가 없으면 클릭 불가능한 div 로 렌더한다", () => {
    renderCard({ id: "svc-6", name: "미배선 서비스" });

    expect(
      screen.queryByRole("link", { name: /바로가기/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("미배선 서비스")).toBeInTheDocument();
  });

  // 죽은 레거시 링크('/services') — 링크 없음과 동일하게 취급(현행 유지).
  test("죽은 레거시 링크(/services)는 링크 없음으로 취급한다", () => {
    renderCard({ id: "svc-7", name: "레거시 서비스", link: "/services" });

    expect(
      screen.queryByRole("link", { name: /바로가기/ }),
    ).not.toBeInTheDocument();
  });

  test("icon_image_url 이 없으면 일러스트 영역에 이미지를 렌더하지 않는다(폴백 아이콘 없음)", () => {
    renderCard({
      id: "svc-8",
      name: "아이콘 없는 서비스",
      link: "/page/services-etc",
    });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("설명이 없으면 설명 텍스트 노드를 렌더하지 않는다", () => {
    const { container } = renderCard({
      id: "svc-9",
      name: "설명 없는 서비스",
      link: "/page/services-etc",
    });

    expect(container.querySelectorAll(".text-ink-natural")).toHaveLength(0);
  });
});
