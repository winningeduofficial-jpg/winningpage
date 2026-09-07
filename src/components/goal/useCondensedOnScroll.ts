import { useEffect, useRef, useState } from "react";

// 목표관리 페이지 헤더(`GoalPageHeader`) 접힘 훅 — 수행평가 채팅 셸
// (`PerformanceAppLayout.tsx`)의 타이틀 접힘 관례를 이식한다(2026-09-06 사용자 확정).
//
// 수행평가는 채팅 캔버스가 **자체 스크롤 컨테이너**(`MessageScroller`)라 그 컴포넌트가
// 내보내는 `data-scrollable` 속성을 CSS `group-has()`로 읽기만 하면 됐다(JS 리스너 없음).
// 목표관리 페이지는 **문서(window) 스크롤**이라 그런 라이브러리 속성이 없다 — 대신 헤더
// 바로 앞에 높이 0인 sentinel을 두고, sentinel이 sticky 헤더 아래로 사라지는 순간을
// `IntersectionObserver`로 감지한다. `rootMargin`을 헤더 높이(`--header-height`, 4rem
// = 64px, AppShellSidebar.tsx가 정본)만큼 위로 당겨두면, sentinel이 sticky 헤더의 고정
// 지점(`top: var(--header-height)`)을 지나는 순간 정확히 `isIntersecting`이 꺼진다 —
// 스크롤 이벤트 리스너·수동 위치 계산이 필요 없다.
//
// px 단위(HEADER_HEIGHT_PX)를 쓰는 이유: IntersectionObserver의 rootMargin은 CSS 속성이
// 아니라 JS API 값이라 px·%만 허용한다(rem 불가) — `useInView.ts` rootMargin 주석과 같은
// 예외 근거. 4rem 리터럴을 여기 다시 박는 대신 `--header-height` 정의 자체를 바꾸면 이 값도
// 같이 바꿔야 한다는 점은 AppShellSidebar.tsx가 이미 h-16을 리터럴로 가정하는 다른 지점들과
// 동일한 기존 트레이드오프다.
const HEADER_HEIGHT_PX = 64;

/**
 * @returns sentinelRef: 헤더 바로 앞에 둘 높이 0 sentinel에 붙일 ref.
 *          isCondensed: sentinel이 sticky 헤더 아래로 사라지면(=스크롤이 헤더를
 *          밀어올렸으면) true.
 */
export function useCondensedOnScroll() {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isCondensed, setIsCondensed] = useState(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setIsCondensed(!entry.isIntersecting);
      },
      { rootMargin: `-${HEADER_HEIGHT_PX}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, isCondensed };
}
