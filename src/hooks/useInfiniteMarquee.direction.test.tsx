// useInfiniteMarquee 의 direction 옵션(QA 행219·221: 메인랜딩 마퀴 좌→우 전환) 회귀 테스트.
//
// jsdom은 레이아웃 엔진이 없어 offsetLeft/scrollWidth가 항상 0이다 — 훅의 실측 기반
// measureCycleWidth가 정확한 주기를 잡도록 각 아이템의 offsetLeft를 인위로 정의해
// 실제 카드 배치를 흉내낸다. requestAnimationFrame/performance는 fake timers로 대체해
// 프레임 진행을 결정적으로 제어한다.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInfiniteMarquee } from "./useInfiniteMarquee";

const ITEM_WIDTH = 100; // px, 임의의 카드 폭
const ITEM_COUNT = 2;
// 훅 내부 MIN_REPEAT_COUNT(3)와 동일 — clientWidth가 0(jsdom 기본값)이라
// repeatCount 자동 증가 effect(!clientWidth 가드)가 동작하지 않아 항상 3으로 고정된다.
const REPEAT_COUNT = 3;
const CYCLE_WIDTH = ITEM_COUNT * ITEM_WIDTH; // 200

function TestMarquee({
  direction,
  speed,
}: {
  direction?: "left" | "right";
  speed?: number;
}) {
  const { scrollRef, repeatIndices, containerHandlers } = useInfiniteMarquee({
    itemCount: ITEM_COUNT,
    ...(direction !== undefined && { direction }),
    ...(speed !== undefined && { speed }),
  });

  return (
    <div
      data-testid="scroll"
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      {...containerHandlers}
    >
      {repeatIndices.map((itemIndex, position) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 테스트 전용 더미 마퀴 아이템
        <div key={position} data-item-index={itemIndex} />
      ))}
    </div>
  );
}

// scrollRef 컨테이너에 붙는 자식들의 offsetLeft를 position*ITEM_WIDTH 로 고정해
// measureCycleWidth(items[itemCount].offsetLeft - items[0].offsetLeft)가
// 정확히 CYCLE_WIDTH를 실측하도록 만든다.
function stubOffsetLeft(container: HTMLElement) {
  Array.from(container.children).forEach((child, position) => {
    Object.defineProperty(child, "offsetLeft", {
      value: position * ITEM_WIDTH,
      configurable: true,
    });
  });
}

// jsdom은 Element.scrollTo를 구현하지 않는다 — 훅의 positionAtMiddle/recenter가
// scrollTo({ left })로 초기 배치를 하므로 scrollLeft에 대입하는 최소 폴리필을 붙인다.
function stubScrollTo(container: HTMLDivElement) {
  container.scrollTo = ((options?: ScrollToOptions | number) => {
    if (typeof options === "object" && options !== null && "left" in options) {
      container.scrollLeft = options.left ?? container.scrollLeft;
    }
  }) as HTMLDivElement["scrollTo"];
}

describe("useInfiniteMarquee direction", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("기본값(left)은 scrollLeft를 증가시킨다(기존 우→좌 시각 흐름 유지)", () => {
    const { getByTestId } = render(<TestMarquee />);
    const container = getByTestId("scroll") as HTMLDivElement;
    expect(container.children).toHaveLength(ITEM_COUNT * REPEAT_COUNT);
    stubScrollTo(container);
    stubOffsetLeft(container);

    // 마운트 rAF(positionAtMiddle 등) 플러시 — 중앙 사이클(scrollLeft = CYCLE_WIDTH)로 배치.
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(container.scrollLeft).toBe(CYCLE_WIDTH);

    const before = container.scrollLeft;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(container.scrollLeft).toBeGreaterThan(before);
  });

  it("direction='right'는 scrollLeft를 감소시킨다(좌→우 시각 흐름)", () => {
    const { getByTestId } = render(<TestMarquee direction="right" />);
    const container = getByTestId("scroll") as HTMLDivElement;
    stubScrollTo(container);
    stubOffsetLeft(container);

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(container.scrollLeft).toBe(CYCLE_WIDTH);

    const before = container.scrollLeft;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(container.scrollLeft).toBeLessThan(before);
  });

  it("direction='right'가 하한(cycleWidth*0.5)에 닿으면 cycleWidth만큼 점프해 루프를 유지한다", () => {
    const speed = 0.02; // LANDING_MARQUEE_SPEED와 동일 크기
    const { getByTestId } = render(
      <TestMarquee direction="right" speed={speed} />,
    );
    const container = getByTestId("scroll") as HTMLDivElement;
    stubScrollTo(container);
    stubOffsetLeft(container);

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(container.scrollLeft).toBe(CYCLE_WIDTH); // 200

    // 200 -> 하한 100 까지 이동하는 데 필요한 시간(100px / 0.02px/ms = 5000ms) + 여유.
    act(() => {
      vi.advanceTimersByTime(5300);
    });

    // 점프 없이 계속 감소했다면 100 미만(음수 방향)으로 내려갔을 것 — 실제로는
    // normalize가 하한을 크로스하는 순간 +CYCLE_WIDTH 점프해 유효 구간에 복귀한다.
    expect(container.scrollLeft).toBeGreaterThanOrEqual(CYCLE_WIDTH * 0.5);
    expect(container.scrollLeft).toBeLessThan(CYCLE_WIDTH * 2);
  });
});
