import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentRef,
} from "overlayscrollbars-react";
import type * as React from "react";
import { forwardRef } from "react";
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

/** ScrollArea에 ref를 넘기면 이 형태를 받는다 — `.getElement()`로 실제 DOM 노드(루트
 * 컨테이너, 기존 `overflow-y-auto` div를 대체한 자리)에, `.osInstance()`로 OverlayScrollbars
 * 인스턴스(예: `instance.elements().viewport`로 실제 스크롤 노드에 접근해 scrollTop 조작)에
 * 접근한다. */
export type ScrollAreaHandle = OverlayScrollbarsComponentRef<"div">;

type ScrollAreaProps = Omit<React.ComponentProps<"div">, "children" | "ref"> & {
  children?: React.ReactNode;
  /** 스크롤 축. 기본값은 세로(y)만 — 대부분의 패널·모달 본문 컨테이너와 동일한 기본 동작. */
  axis?: ScrollAreaAxis;
  /** OverlayScrollbars 초기화를 유휴 시점(또는 다음 프레임)까지 늦출지 여부 — 기본 true. */
  defer?: boolean;
};

// 공용 오버레이 스크롤바 컨테이너 — `overlayscrollbars-react`(OverlayScrollbarsComponent) 래퍼.
// 레이아웃 폭을 차지하는 네이티브 스크롤바 대신 콘텐츠 위에 겹쳐지는 스크롤바를 그린다
// (드로어·모달이 열려 body 네이티브 스크롤바가 사라질 때 생기던 레이아웃 밀림 대응).
// 기존 `overflow-y-auto` div의 1:1 대체가 목표라, className은 이 루트(컨테이너 — 높이·
// max-h·패딩 담당)에 그대로 붙고 실제 스크롤은 내부 뷰포트가 담당한다. 옵션(테마·autoHide
// 정책)은 src/lib/scrollbarOptions.ts 단일 모듈을 body 초기화(src/App.tsx)와 공유한다.
const ScrollArea = forwardRef<ScrollAreaHandle, ScrollAreaProps>(
  function ScrollArea(
    { className, children, axis = "y", defer = true, ...props },
    ref,
  ) {
    const { x, y } = AXIS_OVERFLOW[axis];

    return (
      <OverlayScrollbarsComponent
        ref={ref}
        data-slot="scroll-area"
        defer={defer}
        options={{
          scrollbars: scrollbarsOptions,
          overflow: { x, y },
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
