import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

// 소프트 내비게이션 중 로딩 표시 — goal-mapping.md 행297 대응.
//
// HydrateFallback(routeMiddleware.ts 짝 컴포넌트, RouteGuardUi.tsx)은 **하드
// 로드에서만** 노출되고, SPA 소프트 내비게이션 중에는 react-router가 이전 화면을
// 그대로 유지한다(RouteGuardUi.tsx:7-11 주석) — middleware가 서버 왕복을
// 끝내기 전까지 클릭해도 아무 반응이 없는 것처럼 보이는 원인이었다.
// useNavigation().state로 그 "커밋 대기" 구간을 잡아 사용자에게 신호를 준다.
//
// 목표관리(GoalAppLayout)·수행평가(PerformanceAppLayout) 두 셸이 공유한다 —
// 두 셸 모두 middleware/RequireEntitlement 판정 방식은 다르지만 하나의
// createBrowserRouter(App.tsx)를 쓰므로 useNavigation은 두 쪽 다 동일하게
// 동작한다.
//
// 150ms 지연 표시: 캐시가 fresh해 즉시 끝나는 이동까지 깜빡이면 오히려 소음이라,
// 그 미만으로 끝나는 이동에서는 아예 렌더하지 않는다.
const SHOW_DELAY_MS = 150;

export default function RouteLoadingOverlay() {
  const navigation = useNavigation();
  const isNavigating = navigation.state !== "idle";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isNavigating) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isNavigating]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="페이지를 불러오는 중"
      className="absolute inset-0 z-40 flex items-center justify-center bg-white/60"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-primary" />
    </div>
  );
}
