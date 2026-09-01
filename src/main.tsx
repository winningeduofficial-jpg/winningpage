import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthProvider";
import { queryClient } from "./lib/queryClient";
import "./styles/pretendard.css"; // 벤더 원본(92 @font-face). 본문 서체 — 등록만 한다
import "./styles/fonts.css"; // 우리 선언(GraceSerif 1블록)
import "./index.css"; // 사용 — 등록 → 사용 순서

// 정적 import(`import { ReactQueryDevtools } from "@tanstack/react-query-devtools"`)는
// import.meta.env.DEV로 렌더를 막아도 모듈 자체는 메인 번들에 함께 실린다 —
// 프로덕션 사용자가 devtools 코드까지 내려받는 문제가 있었다(리뷰 M4). React.lazy로
// 별도 청크로 분리하면 그 문제는 해결된다: import.meta.env.DEV가 false면 이
// 컴포넌트를 렌더하지 않으므로(43번째 줄 아래) 그 청크는 아예 요청되지 않는다.
//
// ⚠️ 다만 이 조치가 `npm ci --omit=dev`처럼 devDependencies 없이 설치된 환경의
// 빌드 실패까지 막아주지는 않는다(재검증 LOW, 이전 주석의 부정확한 서술 정정) —
// Vite/Rollup은 동적 `import()`도 빌드 시점에 정적으로 해석해 청크를 만들어야
// 하므로, `@tanstack/react-query-devtools`가 devDependency로 실제 설치돼 있다는
// 전제는 여전히 필요하다(이 저장소의 CI/배포가 이미 그 전제를 따른다).
const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then((mod) => ({
    default: mod.ReactQueryDevtools,
  })),
);

function removePreHeader() {
  const preHeader = document.getElementById("pre-header");

  if (!preHeader) return;

  preHeader.remove();
}

// index.html에 #root가 항상 존재하는 정적 마운트 포인트라 non-null 단언.
// queryClient(src/lib/queryClient.ts)는 미들웨어(routeMiddleware.ts)가 React 트리
// 밖에서도 import해 쓰는 모듈 싱글턴이라, 여기서는 Provider로 그 값을 트리에
// 노출만 한다(새로 만들지 않는다).
// AuthProvider는 QueryClientProvider 안쪽·RouterProvider(App 내부) 바깥에 둔다 —
// 전역 세션 구독이라 특정 라우트에 속하지 않아야 한다(docs/client-auth-query-plan.md B-3).
ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <App />
    </AuthProvider>
    {/* 프로덕션 번들에는 절대 포함되지 않아야 하는 개발용 패널 — import.meta.env.DEV로만
        렌더한다. lazy() 덕에 이 조건이 false면 청크 자체를 내려받지 않는다. */}
    {import.meta.env.DEV && (
      <Suspense fallback={null}>
        <ReactQueryDevtools initialIsOpen={false} />
      </Suspense>
    )}
  </QueryClientProvider>,
);

requestAnimationFrame(() => {
  requestAnimationFrame(removePreHeader);
});
