import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type * as React from "react";
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
// 테마는 index.css의 `.os-theme-winning`(전역 body 초기화와 동일한 테마) 고정 — 컨테이너별로
// 색을 바꾸지 않는다.
function ScrollArea({
  className,
  children,
  axis = "y",
  defer = true,
  ...props
}: ScrollAreaProps) {
  const { x, y } = AXIS_OVERFLOW[axis];

  return (
    <OverlayScrollbarsComponent
      data-slot="scroll-area"
      defer={defer}
      options={{
        scrollbars: {
          autoHide: "leave",
          autoHideDelay: 600,
          theme: "os-theme-winning",
        },
        overflow: { x, y },
      }}
      className={cn("w-full", className)}
      {...props}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}

export { ScrollArea };
