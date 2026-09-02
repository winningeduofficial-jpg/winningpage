import type { OverlayScrollbars } from "overlayscrollbars";
import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentRef,
} from "overlayscrollbars-react";
import type * as React from "react";
import { forwardRef, useCallback } from "react";
import { scrollbarsOptions } from "@/lib/scrollbarOptions";
import { cn } from "@/lib/utils";

type ScrollAreaAxis = "x" | "y" | "both";

const AXIS_OVERFLOW: Record<
  ScrollAreaAxis,
  { x: "hidden" | "scroll"; y: "hidden" | "scroll" }
> = {
  x: { x: "scroll", y: "hidden" },
  y: { x: "hidden", y: "scroll" },
  both: { x: "scroll", y: "scroll" },
};

/** ScrollArea에 ref(또는 osRef)를 넘기면 이 형태를 받는다 — `.getElement()`로 실제 DOM 노드
 * (루트 컨테이너, 기존 `overflow-y-auto` div를 대체한 자리)에, `.osInstance()`로
 * OverlayScrollbars 인스턴스(예: `instance.elements().viewport`로 실제 스크롤 노드에 접근해
 * `scrollTo`/`scrollTop` 조작)에 접근한다. */
export type ScrollAreaHandle = OverlayScrollbarsComponentRef<"div">;

/** 실제 스크롤 뷰포트 요소(내부 `.os-viewport`, 루트가 아니다)에 붙일 속성 — className으로는
 * 닿지 않는 자리다. 키보드 포커스로 화살표 스크롤이 되어야 하는 "APG Scrollable Regions"
 * 패턴처럼, tabIndex·aria-label·role이 루트가 아니라 실제 스크롤 노드에 있어야 동작하는
 * 접근성 요구를 위한 탈출구다. OverlayScrollbars 초기화가 끝난 시점(`initialized` 이벤트)에
 * 한 번 적용한다 — 뷰포트 DOM 노드는 옵션이 바뀌어도 다시 만들어지지 않으므로 재적용이
 * 필요 없다. */
type ScrollAreaViewportProps = {
  tabIndex?: number;
  "aria-label"?: string;
  role?: string;
};

function applyViewportProps(
  instance: OverlayScrollbars,
  viewportProps: ScrollAreaViewportProps | undefined,
) {
  if (!viewportProps) return;
  const { viewport } = instance.elements();
  const { tabIndex, ...attrs } = viewportProps;
  if (tabIndex !== undefined) viewport.tabIndex = tabIndex;
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined) viewport.setAttribute(name, value);
  }
}

// 하나의 값을 두 ref(콜백/객체 무관)에 동시에 반영 — forwardRef로 받는 `ref`와
// 별도로 노출하는 `osRef` prop이 같은 인스턴스를 가리키게 한다.
function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as React.MutableRefObject<T | null>).current = value;
}

type ScrollAreaProps = Omit<React.ComponentProps<"div">, "children" | "ref"> & {
  children?: React.ReactNode;
  /** 스크롤 축. 기본값은 세로(y)만 — 대부분의 패널·모달 본문 컨테이너와 동일한 기본 동작. */
  axis?: ScrollAreaAxis;
  /** OverlayScrollbars 초기화를 유휴 시점(또는 다음 프레임)까지 늦출지 여부 — 기본 true. */
  defer?: boolean;
  /** `ref`와 동일한 값(ScrollAreaHandle)을 받는 별도 채널 — 둘 다 넘겨도 충돌하지 않는다.
   * "이 컴포넌트가 OverlayScrollbars라는 걸 호출부 코드에서 명시하고 싶을 때"(예:
   * `osRef.current?.osInstance()?.elements().viewport`) ref 대신 이름으로 구분해 쓴다. */
  osRef?: React.Ref<ScrollAreaHandle>;
  viewportProps?: ScrollAreaViewportProps;
};

// 공용 오버레이 스크롤바 컨테이너 — `overlayscrollbars-react`(OverlayScrollbarsComponent) 래퍼.
// 레이아웃 폭을 차지하는 네이티브 스크롤바 대신 콘텐츠 위에 겹쳐지는 스크롤바를 그린다
// (드로어·모달이 열려 body 네이티브 스크롤바가 사라질 때 생기던 레이아웃 밀림 대응).
// 기존 `overflow-y-auto` div의 1:1 대체가 목표라, className은 이 루트(컨테이너 — 높이·
// max-h·패딩 담당)에 그대로 붙고 실제 스크롤은 내부 뷰포트가 담당한다. 옵션(테마·autoHide
// 정책)은 src/lib/scrollbarOptions.ts 단일 모듈을 body 초기화(src/App.tsx)와 공유한다.
const ScrollArea = forwardRef<ScrollAreaHandle, ScrollAreaProps>(
  function ScrollArea(
    {
      className,
      children,
      axis = "y",
      defer = true,
      osRef,
      viewportProps,
      ...props
    },
    ref,
  ) {
    const { x, y } = AXIS_OVERFLOW[axis];

    const setRefs = useCallback(
      (handle: ScrollAreaHandle | null) => {
        setRef(ref, handle);
        setRef(osRef, handle);
      },
      [ref, osRef],
    );

    return (
      <OverlayScrollbarsComponent
        ref={setRefs}
        data-slot="scroll-area"
        defer={defer}
        options={{
          scrollbars: scrollbarsOptions,
          overflow: { x, y },
        }}
        events={{
          initialized: (instance) =>
            applyViewportProps(instance, viewportProps),
        }}
        className={cn("w-full", className)}
        {...props}
      >
        {children}
      </OverlayScrollbarsComponent>
    );
  },
);

export { ScrollArea };
