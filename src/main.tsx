import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/pretendard.css"; // 벤더 원본(92 @font-face). 본문 서체 — 등록만 한다
import "./styles/fonts.css"; // 우리 선언(GraceSerif 1블록)
import "./index.css"; // 사용 — 등록 → 사용 순서

function removePreHeader() {
  const preHeader = document.getElementById("pre-header");

  if (!preHeader) return;

  preHeader.remove();
}

// index.html에 #root가 항상 존재하는 정적 마운트 포인트라 non-null 단언.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

requestAnimationFrame(() => {
  requestAnimationFrame(removePreHeader);
});
