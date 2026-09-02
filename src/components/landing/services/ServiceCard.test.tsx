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
    // alt=""(장식용 이미지)라 접근성 트리에 role="img"로 노출되지 않는다(queryByRole은
    // 이미지 유무와 무관하게 항상 통과) — querySelector로 실제 DOM 존재 여부를 확인한다.
    const { container } = renderCard({
      id: "svc-8",
      name: "아이콘 없는 서비스",
      link: "/page/services-etc",
    });

    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  test("설명이 없으면 설명 텍스트 노드를 렌더하지 않는다", () => {
    const { container } = renderCard({
      id: "svc-9",
      name: "설명 없는 서비스",
      link: "/page/services-etc",
    });

    expect(container.querySelectorAll(".text-ink-natural")).toHaveLength(0);
  });

  // 시안 확정 — 제목·설명 모두 자동 줄바꿈 없음(폭이 좁아지면 일러스트 뒤 여백
  // 스페이서가 대신 줄어든다 — 아래 별도 테스트). 설명은 whitespace-pre라 DB \n만
  // 줄바꿈 지점이고 그 외 자동 줄바꿈은 없다.
  test("제목은 whitespace-nowrap, 설명은 whitespace-pre로 자동 줄바꿈되지 않는다", () => {
    renderCard({
      id: "svc-10",
      name: "국제·해외 프리미엄",
      description: "국제고 해외고 국내대입 컨설팅",
      link: "/page/premium/global-university",
    });

    expect(screen.getByText("국제·해외 프리미엄")).toHaveClass(
      "whitespace-nowrap",
    );
    expect(screen.getByText("국제고 해외고 국내대입 컨설팅")).toHaveClass(
      "whitespace-pre",
    );
  });

  // 시안 확정(리드 재실측) — 일러스트 프레임은 135×178 고정(shrink-0), 텍스트가
  // 길어질 때 대신 줄어드는 건 프레임 뒤 여백 스페이서(21px→0)다.
  test("일러스트 프레임은 shrink-0로 고정되고 뒤에 여백 스페이서가 있다", () => {
    const { container } = renderCard({
      id: "svc-11",
      name: "학습진단",
      link: "/services/learning-diagnosis",
      icon_image_url: "/images/landing/services/learning-diagnosis.png",
    });

    // alt=""(장식용 이미지)라 접근성 트리에서 role="img"로 노출되지 않는다 — querySelector로 조회.
    const img = container.querySelector("img");
    const frame = img?.parentElement;
    expect(frame).toHaveClass("shrink-0");

    const spacer = container.querySelector('span[aria-hidden="true"].shrink');
    expect(spacer).toBeInTheDocument();
    expect(spacer).toHaveClass("w-[1.3125rem]", "min-w-0");
  });
});
