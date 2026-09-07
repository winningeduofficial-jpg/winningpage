import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useCondensedOnScroll } from "./useCondensedOnScroll";

// jsdom은 IntersectionObserver를 구현하지 않는다 — 콜백·옵션을 캡처하는 최소 목으로
// 대체하고, 테스트에서 직접 콜백을 호출해 교차 여부를 흉내낸다.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observedNode: Element | null = null;
  disconnected = false;

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(node: Element) {
    this.observedNode = node;
  }

  disconnect() {
    this.disconnected = true;
  }

  unobserve() {}

  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

// biome noNonNullAssertion 회피용 — 매 테스트가 렌더 직후 인스턴스 1개를 기대하므로
// 없으면 테스트 자체가 실패 사유를 명확히 드러내며 죽는 게 `!`보다 안전하다.
function latestObserver(): FakeIntersectionObserver {
  const observer =
    FakeIntersectionObserver.instances[
      FakeIntersectionObserver.instances.length - 1
    ];
  if (!observer) throw new Error("IntersectionObserver 인스턴스가 없습니다.");
  return observer;
}

function TestComponent() {
  const { sentinelRef, isCondensed } = useCondensedOnScroll();
  return (
    <div>
      <div ref={sentinelRef} aria-hidden data-testid="sentinel" />
      <span data-testid="state">{isCondensed ? "condensed" : "expanded"}</span>
    </div>
  );
}

// jsdom의 scrollHeight는 항상 0이라 "스크롤 여유"를 직접 흉내낸다 — 기본은 접힘
// 델타(108px)보다 넉넉한 값으로 두고, 짧은 페이지 테스트만 좁힌다.
function stubScrollSlack(slackPx: number) {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: window.innerHeight + slackPx,
  });
}

describe("useCondensedOnScroll", () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    stubScrollSlack(600);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("헤더 높이(64px)만큼 위로 당긴 rootMargin으로 sentinel을 관찰한다", () => {
    render(<TestComponent />);

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const observer = latestObserver();
    expect(observer.options?.rootMargin).toBe("-64px 0px 0px 0px");
    expect(observer.observedNode).toBe(screen.getByTestId("sentinel"));
  });

  test("sentinel이 화면에 걸쳐 있으면(교차) 펼침 상태다", () => {
    render(<TestComponent />);
    const observer = latestObserver();

    act(() => observer.trigger(true));

    expect(screen.getByTestId("state")).toHaveTextContent("expanded");
  });

  test("sentinel이 sticky 헤더 아래로 사라지면(비교차) 접힘 상태로 바뀐다", () => {
    render(<TestComponent />);
    const observer = latestObserver();

    act(() => observer.trigger(false));

    expect(screen.getByTestId("state")).toHaveTextContent("condensed");
  });

  test("다시 교차하면 펼침 상태로 되돌아간다", () => {
    render(<TestComponent />);
    const observer = latestObserver();

    act(() => observer.trigger(false));
    expect(screen.getByTestId("state")).toHaveTextContent("condensed");

    act(() => observer.trigger(true));
    expect(screen.getByTestId("state")).toHaveTextContent("expanded");
  });

  test("스크롤 여유가 접힘 델타(108px)보다 작은 짧은 페이지는 접지 않는다", () => {
    stubScrollSlack(40);
    render(<TestComponent />);
    const observer = latestObserver();

    act(() => observer.trigger(false));

    expect(screen.getByTestId("state")).toHaveTextContent("expanded");
  });
});
