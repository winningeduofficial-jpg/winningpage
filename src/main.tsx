import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import ReactDOM from "react-dom/client";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import "./styles/pretendard.css"; // 벤더 원본(92 @font-face). 본문 서체 — 등록만 한다
import "./styles/fonts.css"; // 우리 선언(GraceSerif 1블록)
import "./index.css"; // 사용 — 등록 → 사용 순서

function removePreHeader() {
  const preHeader = document.getElementById("pre-header");

  if (!preHeader) return;

  preHeader.remove();
}

// index.html에 #root가 항상 존재하는 정적 마운트 포인트라 non-null 단언.
// queryClient(src/lib/queryClient.ts)는 미들웨어(routeMiddleware.ts)가 React 트리
// 밖에서도 import해 쓰는 모듈 싱글턴이라, 여기서는 Provider로 그 값을 트리에
// 노출만 한다(새로 만들지 않는다).
ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
    {/* 프로덕션 번들에는 절대 포함되지 않아야 하는 개발용 패널 — import.meta.env.DEV로만 렌더한다. */}
    {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>,
);

requestAnimationFrame(() => {
  requestAnimationFrame(removePreHeader);
});
